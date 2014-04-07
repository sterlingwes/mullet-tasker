/*
 * # Tasker
 * 
 * A task runner and resource builder for apps & client side assets. Mainly convenience methods for gulp / dev / test related tasks.
 * 
 * Example:
 * ```
 *     tasker
 *      .add('templates', [ ['src','templates','(!includes|**)','*\.jade'].join('/') ], gulpjade)
 *      .add('css', [ 'src','css','**','*\.less' ].join('/') , gulpless)
 *      .compile()
 *      .run();
 * ```
 * @exports {Function} that returns the Tasker prototype
 */

var gulp = require('gulp')
  , gdbug = require('gulp-debug')
  , tinylr = require('tiny-lr')
  , webpack = require('webpack')
  , _ = require('underscore')
  , gaze = require('gaze')
  , Combine = require('stream-combiner')
  , fs = require('fs')
  , Promise = require('es6-promise').Promise
  , mkdirp = require('mkdirp')
  , pathLib = require('path')
  , exec = require('child_process').exec;

module.exports = function(config) {
    
    var _DEFAULT_LR_PORT = 9999;
    
    /*
     * ## Tasker.constructor()
     * 
     * Instantiated by the Mullet runtime if the "owner" app is an entry app. Otherwise, the dependent app must instantiate.
     * 
     * @param {Object} app properties for the dependent app, which has:
     *      - mtime (date)
     *      - name (string)
     *      - core (boolean)
     *      - base (string) - absolute to parent app folder
     *      - main (function) - already called onLoad, should not be called again
     *      - info (object) - package.json
     *      - deps (array[string])
     * 
     * @return {Function|Object} function that takes `app` properties or object instance of Tasker
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
        else // if calling app has no vhost (ie: is not a 'root' app), allow the caller to override app value
            return function(app) {
                return new Tasker(app);
            };
        
        this.sharepath = [ config.path , 'public/assets' , app.name ].join('/');
        
        this.tasks = [];
        this.srcs = {};
        this.reload = tinylr();
    }
    
    Tasker.prototype.instantiate = true;
    
    Tasker.prototype.gulp = gulp;
    
    /*
     * ## Tasker.compileLocal()
     * 
     * Compiles a webpack app based on default config, and writes the bundle locally to public/sites
     * 
     * @param {Object} opts on mainly whether to watch for file changes and recompile (opts.live boolean)
     * @return {Object} Promise
     */
    Tasker.prototype.compileLocal = function(opts) {
        
        var webpconfig = {
            cache:  false,
            context: this.app.base,
            entry:  './build/prebuild/bootstrap.js',
            output: {
                path:       this.app.base + '/build/postbuild',
                filename:   'bundle.js'
            },
            module: {
                loaders: [
                    { test: /\.jsx$/, loader: 'jsx' },
                    { test: /\.gif/, loader: 'url?limit=10000&mimetype=image/gif' },
                    { test: /\.less/, loader: 'style!css!less' }
                ]
            },
            resolve: {
                root:   ['D:/Dev/Vagrant/node_modules', 'D:/Dev/Vagrant/bower_components', 'D:/Dev/Vagrant'],
                alias: {
                    libs:       'D:/Dev/Vagrant/mulletapp/libs',
                    reactjs:    'D:/Dev/Vagrant/mulletapp/node_modules/react/react.js',
                    fs:         'D:/Dev/Vagrant/mulletapp/libs/fsblock'
                },
                modulesDirectories: ['bower_components', 'node_modules', 'apps']
            }
        };

        var wpcompiler = webpack(webpconfig);

        return new Promise(function(res,rej) {
            
            wpcompiler.run(function(err, stats) {
                if(err) return rej(err);
                
                if(opts && opts.live) {
                    if(!config.isTesting) {
                        opts.port = opts.port || _DEFAULT_LR_PORT;
                        res();
                        this.reload.listen(opts.port, function(err) {

                            if(err) return console.error(err);
                            console.log( '- LiveReload server listening on port ' + opts.port );
                            
                            console.log('- Watching webpack assets for file changes to reload');
                            wpcompiler.watch(200, function(err, stats) {
                                if(err) return rej(err);
                                this.copyFile( this.app.base + '/build/postbuild/bundle.js', 'js/*' ).then(function() {
                                    this.reload.changed({
                                        body: {
                                            files:  ['/js/bundle.js']
                                        }
                                    });
                                }.bind(this));
                            }.bind(this));

                        }.bind(this));
                    }
                }
                else
                    res();
            }.bind(this));
            
        }.bind(this)).then(function() {
            
            return this.copyFile( this.app.base + '/build/postbuild/bundle.js', 'js/*' );
            
        }.bind(this));
    };
    
    /*
     * ## Tasker.compile()
     * 
     * Compiles a webpack app based on the webpack.config.js file (or fair defaults if non provided).
     * 
     * @param {Object} aug that augments the webpack config (overwrites)
     * @return {Object} itself
     */
    Tasker.prototype.compile = function(aug) {
        
        var webpconfig;
        
        try {
            webpconfig = require( this.app.base + '/webpack.config.js' );
        }
        catch(e) {
            if(e.code == 'MODULE_NOT_FOUND') {
                console.warn('! Tasker.compile, no webpack.config.js found in ' + this.app.base );
            }
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
        
        // TODO: needs to wait for the app to build before copying dist? Should also handle minimize / optimize here
        
        this.add( 'webpack-dist' , function() {
            
            return gulp.src( this.app.base + ['/build','**','*'].join('/') )
                    .pipe( this.dest( this.sharepath ) );
            
        }.bind(this) );
        
        return this;
        
    };
    
    /*
     * ## Tasker.absoluteSrc()
     * 
     * Convert relative path / glob to absolute app path to src file.
     * 
     * @param {Array|String} globs
     * @return {Array} of absolute paths
     */
    Tasker.prototype.absoluteSrc = function( globs ) {
        if(!_.isArray(globs)) globs = [globs];
        
        return _.map(globs, function(glob) {
            return glob.replace(/^\.?\/?/, this.app.base + '/');
        }.bind(this));
    };
    
    /*
     * ## Tasker.add()
     * 
     * Add a gulp task.
     * 
     * @return {Object} itself
     */
    Tasker.prototype.add = function() {
        
        var lastTask = this.tasks[this.tasks.length-1];
        if(lastTask && typeof lastTask === 'function')
            return console.warn(' ! Tasker.add() - live() or watch() should be called after all tasks are add()ed');
        
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
     * ## Tasker.pipeTo 
     * 
     * Convenience for sending files to their app's public place. To be used with Combiner.
     * 
     * @param {Array|String} override if specified, acts just like gulp.dest()
     * @return {Array} of gulp.dest calls for Combine to add to stream
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
     * ## Tasker.dest()
     * 
     * Proxy for gulp.dest to maintain tasker chainability.
     * 
     * @param {Array|String} path to write to
     * @return {Object} gulp.dest() return value
     */
    Tasker.prototype.dest = function(path) {
        return gulp.dest(path);
    };
    
    /*
     * ## Tasker.watch() 
     * 
     * Watches stored src maps for file changes. Should not be called with live().
     */
    Tasker.prototype.watch = function() {
        
        // TODO: consider mapping by task name instead of glob src?
        
        if(this.watching)
            return console.warn(' ! Tasker.watch() called more than once, have you also called live()?');
        
        var taskr = this;
        _.each( this.srcs, function( tasks, glob ) {
            gaze(glob, function(err, watcher) {
                taskr.watching = true;
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
     * ## Tasker.live() 
     * 
     * Starts a liveReload server to listen (uses Tasker.watch()). Should be directly before Tasker.run().
     * 
     * @param {Number} port specifies location for tinylr to listen. Defaults to 9999
     * @return {Object} itself
     */
    Tasker.prototype.live = function(port) {
        
        if(!port)   port = _DEFAULT_LR_PORT;
        
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
     * ## Tasker.run()
     * 
     * Runs all tasks added with Tasker.add().
     * 
     * @param {String} taskGroup optional name of tasks to run
     */
    Tasker.prototype.run = function(taskGroup) {
        
        if(this.running)
            console.warn(' ! Tasker.run() called more than once.');
        
        var taskList = typeof _.last(this.tasks) === 'function' ? this.tasks.slice(0, this.tasks.length-1) : this.tasks;
        console.log('  - Tasker running', taskList.join(', '));

        this.running = true;
        gulp.start.apply(gulp, taskGroup || this.tasks);
        
    };

    /*
     * ## Tasker.copyFile()
     * 
     * Convenience for copying files
     * 
     * @param {String} from file to copy (can be a wildcard)
     * @param {String} to file to copy to (if star / wildcard ending for to, copies to all app destination paths), ex: 'js/*' means /public/sites/localhost/js/copiedfile
     * @return {Object} Promise
     */
    Tasker.prototype.copyFile = function(from, to) {
        
        var dests = to[to.length-1] == '*' ? _.map(this.destpaths, function(d) { return d + '/' + to.substr(0,to.length-1).replace(/^\.?\//,''); }) : ( _.isArray(to) ? to : [ to ] )
          , promises = [];
        
        dests.forEach(function(destpath) {
            promises.push(new Promise(function(res, rej) {
                mkdirp(destpath[destpath.length-1]=='/' ? destpath : pathLib.dirname(destpath), function(err) {
                    if(!err)
                        exec('cp ' + from + ' ' + destpath, function(err, stout, sterr) {
                            if(err) return rej(err);
                            else    return res(stout, sterr);
                        });
                });
            }));
        });
        
        return Promise.all(promises);
    };
    
    /*
     * ## Tasker.writeFile()
     * 
     * Convenience for writing files with FS.
     * 
     * @param {String} name of file
     * @param {String} data to write in UTF8
     * @param {String} destination (optional) path to write file to
     * @param {String} fsOp designating override for fs.writeFile default (must have the same api, like 'appendFile' for fs.appendFile)
     * @return {Object} instance of Promise
     */
    Tasker.prototype.writeFile = function(name, data, destination, fsOp) {
        
        if(!destination && (!this.destpaths || !this.destpaths.length) )
            return console.error('  ! Tasker.writeFile(), no destination paths available.');

        var dests = destination ? [ destination ] : this.destpaths
          , promises = [];
            
        _.each(dests, function(destpath) {
            promises.push(new Promise(function(resolve, reject) {
                var writePath = destpath + '/' + name;
                mkdirp(pathLib.dirname(writePath), function(err) {
                    if(err) return reject(err);
                    fs[fsOp || 'writeFile'](writePath, data, function(err) {
                        if(err) reject(err);
                        else    resolve(writePath);
                    });
                });
            }));
        });
        
        return Promise.all(promises);
    };

    /*
     * ## Tasker.appendFile()
     * 
     * 
     */
    Tasker.prototype.appendFile = function(name, data, destination) {
        return this.writeFile(name, data, destination, 'appendFile');
    };
    
    return Tasker;
    
};