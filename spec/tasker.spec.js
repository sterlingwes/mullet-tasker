var Tasker = require('../main.js')({
        path:   '/path/to/app'
    })

  , appBase = '/path/to/app/apps/myapp'
  , path = '/path/to/app'

  , app1 = {
      mtime:    new Date(),
      name:     'myapp',
      base:     appBase,
      info: {
          name: 'my app package',
          mullet: {
              vhost:    'localhost'
          }
      }
  }

  , fs = require('fs');

var tasker = new Tasker(app1);

describe('Tasker', function() {
    
    it('should setup destination and share paths', function() {
        
        expect(tasker.destpaths).toEqual( [path + '/public/sites/localhost'] );
        expect(tasker.sharepath).toEqual( path + '/public/assets/myapp' );
        
    });
   
    it('should write files', function(done) {
        
        var promise = tasker.writeFile('testfile', 'this is my test file', __dirname);
        
        promise.then(function() {
            // check that file exists here.
            fs.stat( __dirname + '/testfile', function(err,stat) {
                expect(!!err).toEqual(false);
                expect(!!stat).toEqual(true);
                done();
            });
        });
        
    });
    
    it('should make glob paths absolute', function() {
        
        var path = tasker.absoluteSrc('client/**/*\.css');
        expect(path).toEqual( [appBase + '/client/**/*\.css'] );
        
        path = tasker.absoluteSrc('./*\.js');
        expect(path).toEqual( [appBase + '/*\.js'] );
        
    });
    
    it('should add gulp tasks', function() {
        
        tasker.add('clientTask', 'client/**/*\.less', function() {});
        
        expect(tasker.tasks).toEqual( ['myapp-clientTask'] );
        var srcs = {};
        srcs[ appBase + '/client/**/*\.less' ] = ['myapp-clientTask'];
        expect(tasker.srcs).toEqual( srcs );
        
        expect(Object.keys(tasker.gulp.tasks || {}).length).toEqual(1);
        
    });
    
});