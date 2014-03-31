# Tasker

A task runner and resource builder for apps & client side assets. Mainly convenience methods for gulp / dev / test related tasks.

Example:
```
    tasker
     .add('templates', [ ['src','templates','(!includes|**)','*\.jade'].join('/') ], gulpjade)
     .add('css', [ 'src','css','**','*\.less' ].join('/') , gulpless)
     .compile()
     .run();
```

****

## Tasker.constructor()

Instantiated by the Mullet runtime if the "owner" app is an entry app. Otherwise, the dependent app must instantiate.

*	*app* `Object` properties for the dependent app, which has:
	- mtime (date)
	- name (string)
	- core (boolean)
	- base (string) - absolute to parent app folder
	- main (function) - already called onLoad, should not be called again
	- info (object) - package.json
	- deps (array[string])
*	
*	*returns* `Function,Object` function that takes `app` properties or object instance of Tasker

****

## Tasker.compileLocal()

Compiles a webpack app based on default config, and writes the bundle locally to public/sites

*	*returns* `Object` Promise

****

);
            
        }.bind(this));
    };
    
    /*
## Tasker.compile()

Compiles a webpack app based on the webpack.config.js file (or fair defaults if non provided).

*	*aug* `Object` that augments the webpack config (overwrites)
*	*returns* `Object` itself

****

## Tasker.absoluteSrc()

Convert relative path / glob to absolute app path to src file.

*	*globs* `Array,String` undefined
*	*returns* `Array` of absolute paths

****

## Tasker.add()

Add a gulp task.

*	*returns* `Object` itself

****

## Tasker.pipeTo 

Convenience for sending files to their app's public place. To be used with Combiner.

*	*override* `Array,String` if specified, acts just like gulp.dest()
*	*returns* `Array` of gulp.dest calls for Combine to add to stream

****

## Tasker.dest()

Proxy for gulp.dest to maintain tasker chainability.

*	*path* `Array,String` to write to
*	*returns* `Object` gulp.dest() return value

****

## Tasker.watch() 

Watches stored src maps for file changes. Should not be called with live().

****

## Tasker.live() 

Starts a liveReload server to listen (uses Tasker.watch()). Should be directly before Tasker.run().

*	*port* `Number` specifies location for tinylr to listen. Defaults to 9999
*	*returns* `Object` itself

****

## Tasker.run()

Runs all tasks added with Tasker.add().

*	*taskGroup* `String` optional name of tasks to run

****

## Tasker.copyFile()

Convenience for copying files

*	*from* `String` file to copy (can be a wildcard)
*	*to* `String` file to copy to (if star / wildcard ending for to, copies to all app destination paths), ex: 'js/*' means /public/sites/localhost/js/copiedfile
*	*returns* `Object` Promise

****

## Tasker.writeFile()

Convenience for writing files with FS.

*	*name* `String` of file
*	*data* `String` to write in UTF8
*	*destination* `String` (optional) path to write file to
*	*fsOp* `String` designating override for fs.writeFile default (must have the same api, like 'appendFile' for fs.appendFile)
*	*returns* `Object` instance of Promise

****

## Tasker.appendFile()