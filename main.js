var gulp = require('gulp')
  , gdbug = require('gulp-debug')
  , tinylr = require('tiny-lr')
  , webpack = require('webpack')
  , _ = require('underscore')
  , gaze = require('gaze')
  , Combine = require('stream-combiner')
  , fs = require('fs')
  , RSVP = require('rsvp')
  , mkdirp = require('mkdirp')
  , pathLib = require('path');

module.exports = function(config) {
    
    /*
     * Tasker - mainly convenience methods for gulp / dev / test related tasks
     * 
     * - app, object of properties for calling app, has:
     *      + mtime (date)
     *      + name (string)
     *      + core (boolean)
     *      + base (string) - absolute to parent app folder
     *      + main (function) - already called onLoad, should not be called again
     *      + info (object) - package.json
     *      + deps (array[string])
     */
    function Tasker(app) {
        
        this.app = app;
        this.package = app.info || {};
        this.mlt = this.package.mullet || {};
        this.destpaths = [];
        
        if( this.mlt.vhost ) {
            _.each( _.isArray(this.mlt.vhost) ? this.mlt.vhost : [this.mlt.vhost], function(host) {
                this.destpaths.push( [ config.path , 'public/sites' , host ].join('/') );
             }.bind(this));
        }
        
        this.sharepath = [ config.path , 'public/assets' , app.name ].join('/');
        
        this.tasks = [];
        this.srcs = {};
        this.reload = tinylr();
    }
    
    Tasker.prototype.gulp = gulp;
    
    /*
     * Tasker.compile() - compiles a webpack app based on the webpack.config.js file
     * 
     * - aug, object that augments the webpack config (overwrites)
     */
    Tasker.prototype.compile = function(aug) {
        
        var webpconfig;
        
        try {
            webpconfig = require( this.app.base + '/webpack.config.js' );
        }
        catch(e) {
            if(e.code == 'MODULE_NOT_FOUND')
                console.warn('! Tasker.compile, no webpack.config.js found in ' + this.app.base );
            else
                console.error(err);
        }
        
        if( !webpconfig || typeof webpconfig !== 'object')
            return this;
        
        if(aug && typeof aug === 'object')
            _.extend(webpconfig, aug);
        
        webpconfig.context = this.app.base;

        var wpcompiler = webpack(webpconfig);

        this.add( 'webpack-build' , function(cb) {
            
            wpcompiler.run(function(err, stats) {
                if(err) return console.error(err);
                cb();
            });
            
        });
        
        this.add( 'webpack-dist' , function() {
            
            return gulp.src( this.app.base + '/build/**/*' )
                    .pipe( this.dest( this.sharepath ) );
            
        }.bind(this) );
        
        return this;
        
    };
    
    /*
     * Tasker.absoluteSrc() - convert relative glob to absolute app path to src file
     * 
     * - globs, string or array[string]
     */
    Tasker.prototype.absoluteSrc = function( globs ) {
        if(!_.isArray(globs)) globs = [globs];
        
        return _.map(globs, function(glob) {
            return glob.replace(/^\.?\/?/, this.app.base + '/');
        }.bind(this));
    };
    
    /*
     * Tasker.add() - add a gulp task
     * 
     * return instance
     */
    Tasker.prototype.add = function() {
        
        var args = Array.prototype.slice.call(arguments, 0)
          , taskName = args[0] = this.app.name + '-' + args[0];
        
        this.tasks.push(taskName);
        
        if((typeof args[1] === 'string' || _.isArray(args[1])) && _.isObject(args[2])) {
            
            // build function for simple pipe chaining
            
            args[1] = this.absoluteSrc(args[1]);
            
            // build src map for potential watch()

            _.each(args[1], function(src) {
                if(!this.srcs[src])  this.srcs[src] = [];
                this.srcs[src].push( taskName );
            }.bind(this));
            
            gulp.task(taskName, function() {
                
                var stream = [ gulp.src( args[1] ) ];
                
                // lay pipe
                
                _.each( _.isArray(args[2]) ? args[2] : [ args[2] ], function(method) {
                    stream.push( typeof method === 'function' ? method() : method );
                });

                [].push.apply(stream, this.pipeTo() );
                
                stream = Combine.apply(Combine, stream);
                stream.on('error', function(err) {
                    console.error(err);
                });
                
                return stream;
                
            }.bind(this));
        }
        else // otherwise pass args verbatim
            gulp.task.apply(gulp, args);
        
        return this;
    };
    
    /*
     * Tasker.pipeTo - convenience for sending files to their app's public place. To be user with Combiner
     * 
     * - override, string or array[string]. If specified, acts just like gulp.dest()
     * 
     * returns array of gulp.dest calls for Combine to add to stream
     */
    Tasker.prototype.pipeTo = function(override) {
        
        if(!override && (!this.destpaths || !this.destpaths.length) )
            return console.error('! Tasker.pipeTo() Error: app has no vhost specified or no destination override.');
        
        if(override && !_.isArray(override))
            override = [ override ];
        
        var out = override || this.destpaths;
        
        return _.map(out, function(path) {
            return gulp.dest(path);
        });
        
    };
    
    /*
     * Tasker.dest() - proxy for gulp.dest to maintain tasker chainability
     * 
     * - path, string or array[string] of paths to write to
     */
    Tasker.prototype.dest = function(path) {
        return gulp.dest(path);
    };
    
    /*
     * Tasker.watch() - watches stored src maps for file changes. Should not be called with live()
     *                  TODO: add check to avoid re-running and consider mapping by task name instead of glob src?
     */
    Tasker.prototype.watch = function() {
        
        var taskr = this;
        _.each( this.srcs, function( tasks, glob ) {
            gaze(glob, function(err, watcher) {
                this.on('all', function(event, filepath) {

                    var changedFile = filepath;

                    gulp.start(tasks, function(err) {
                        if(err) console.error(err);
                        taskr.reload.changed({
                            body: {
                                files:  [changedFile]
                            }
                        });
                    });
                });
            });
        });
        
    };
    
    /*
     * Tasker.live() - starts a liveReload server to listen
     * 
     * - port, number. Specifies location for tinylr to listen. Defaults to 9999
     */
    Tasker.prototype.live = function(port) {
        
        if(!port)   port = 9999;
        
        this.tasks.push(function(err) {
            if(err) return console.error(err);

			if(!config.isTesting) {
				this.reload.listen(port, function(err) {
					
					if(err) return console.error(err);
					console.log( '- LiveReload server listening on port ' + port );
					
					this.watch();
				}.bind(this));
			}
        }.bind(this));
        
        return this;
        
    };
    
    /*
     * Tasker.run()
     * 
     * - taskGroup, string
     */
    Tasker.prototype.run = function(taskGroup) {
        
        var taskList = typeof _.last(this.tasks) === 'function' ? this.tasks.slice(0, this.tasks.length-1) : this.tasks;
        console.log('  - Tasker running', taskList.join(', '));

        gulp.start.apply(gulp, taskGroup || this.tasks);
        
    };
    
    /*
     * Tasker.writeFile() - convenience for writing files with FS
     * 
     * - name, string of file name
     * - data, string
     * - destination, string (optional) path to write file to
     * 
     * returns a new RSVP.Promise
     */
    Tasker.prototype.writeFile = function(name, data, destination) {
        
        if(!destination && (!this.destpaths || !this.destpaths.length) )
            return console.error('  ! Tasker.writeFile(), no destination paths available.');

        var dests = destination ? [ destination ] : this.destpaths
          , promises = [];
            
        _.each(dests, function(destpath) {
            promises.push(new RSVP.Promise(function(resolve, reject) {
                var writePath = destpath + '/' + name;
                mkdirp(pathLib.dirname(writePath), function(err) {
                    if(err) return cb(err);
                    fs.writeFile(writePath, data, function(err) {
                        if(err) reject(err);
                        else    resolve(writePath);
                    });
                });
            }));
        });
        
        return RSVP.all(promises);
    };
    
    return Tasker;
    
};