(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var WebApp = Package.webapp.WebApp;
var WebAppInternals = Package.webapp.WebAppInternals;
var main = Package.webapp.main;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

var require = meteorInstall({"node_modules":{"meteor":{"vite:bundler":{"server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/vite_bundler/server.js                                                            //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
!function (module1) {
  let Meteor;
  module1.link("meteor/meteor", {
    Meteor(v) {
      Meteor = v;
    }
  }, 0);
  let WebAppInternals;
  module1.link("meteor/webapp", {
    WebAppInternals(v) {
      WebAppInternals = v;
    }
  }, 1);
  let fork;
  module1.link("node:child_process", {
    fork(v) {
      fork = v;
    }
  }, 2);
  if (Meteor.isDevelopment) {
    const cwd = guessCwd();
    const viteSetup = {
      host: 'localhost',
      port: 0,
      entryFile: ''
    };
    WebAppInternals.registerBoilerplateDataCallback('meteor-vite', (request, data, arch) => {
      const {
        host,
        port,
        entryFile
      } = viteSetup;
      if (entryFile) {
        data.dynamicBody = "".concat(data.dynamicBody || "", "\n<script type=\"module\" src=\"http://").concat(host, ":").concat(port, "/").concat(entryFile, "\"></script>\n");
      } else {
        // Vite not ready yet
        // Refresh page after some time
        data.dynamicBody = "".concat(data.dynamicBody || "", "\n<script>setTimeout(() => location.reload(), 500)</script>\n");
      }
    });

    // Use a worker to skip reify and Fibers
    // Use a child process instead of worker to avoid WASM/archived threads error
    const child = fork(Assets.absoluteFilePath('worker-dev.mjs'), {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      cwd,
      detached: false
    });
    child.on('message', _ref => {
      let {
        kind,
        data
      } = _ref;
      switch (kind) {
        case 'viteSetup':
          Object.assign(viteSetup, data);
          if (!viteSetup.entryFile) {
            throw new Meteor.Error(500, 'Missing `meteor.clientEntry` with path to entry file (the one you want to build with Vite) in your vite config.');
          }
          break;
        default:
          console.log(kind, data);
      }
    });
    child.send('start');
    ['exit', 'SIGINT', 'SIGHUP', 'SIGTERM'].forEach(event => {
      process.once(event, () => {
        child.kill();
      });
    });
  }
  function guessCwd() {
    var _process$env$PWD;
    let cwd = (_process$env$PWD = process.env.PWD) !== null && _process$env$PWD !== void 0 ? _process$env$PWD : process.cwd();
    const index = cwd.indexOf('.meteor');
    if (index !== -1) {
      cwd = cwd.substring(0, index);
    }
    return cwd;
  }
}.call(this, module);
////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json",
    ".mjs"
  ]
});

var exports = require("/node_modules/meteor/vite:bundler/server.js");

/* Exports */
Package._define("vite:bundler", exports);

})();

//# sourceURL=meteor://💻app/packages/vite_bundler.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvdml0ZTpidW5kbGVyL3NlcnZlci5qcyJdLCJuYW1lcyI6WyJNZXRlb3IiLCJtb2R1bGUxIiwibGluayIsInYiLCJXZWJBcHBJbnRlcm5hbHMiLCJmb3JrIiwiaXNEZXZlbG9wbWVudCIsImN3ZCIsImd1ZXNzQ3dkIiwidml0ZVNldHVwIiwiaG9zdCIsInBvcnQiLCJlbnRyeUZpbGUiLCJyZWdpc3RlckJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrIiwicmVxdWVzdCIsImRhdGEiLCJhcmNoIiwiZHluYW1pY0JvZHkiLCJjaGlsZCIsIkFzc2V0cyIsImFic29sdXRlRmlsZVBhdGgiLCJzdGRpbyIsImRldGFjaGVkIiwib24iLCJraW5kIiwiT2JqZWN0IiwiYXNzaWduIiwiRXJyb3IiLCJjb25zb2xlIiwibG9nIiwic2VuZCIsImZvckVhY2giLCJldmVudCIsInByb2Nlc3MiLCJvbmNlIiwia2lsbCIsImVudiIsIlBXRCIsImluZGV4IiwiaW5kZXhPZiIsInN1YnN0cmluZyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQUFBLElBQUlBLE1BQU07RUFBQ0MsT0FBTyxDQUFDQyxJQUFJLENBQUMsZUFBZSxFQUFDO0lBQUNGLE1BQU0sQ0FBQ0csQ0FBQyxFQUFDO01BQUNILE1BQU0sR0FBQ0csQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlDLGVBQWU7RUFBQ0gsT0FBTyxDQUFDQyxJQUFJLENBQUMsZUFBZSxFQUFDO0lBQUNFLGVBQWUsQ0FBQ0QsQ0FBQyxFQUFDO01BQUNDLGVBQWUsR0FBQ0QsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlFLElBQUk7RUFBQ0osT0FBTyxDQUFDQyxJQUFJLENBQUMsb0JBQW9CLEVBQUM7SUFBQ0csSUFBSSxDQUFDRixDQUFDLEVBQUM7TUFBQ0UsSUFBSSxHQUFDRixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBSTVOLElBQUlILE1BQU0sQ0FBQ00sYUFBYSxFQUFFO0lBQ3hCLE1BQU1DLEdBQUcsR0FBR0MsUUFBUSxFQUFFO0lBRXRCLE1BQU1DLFNBQVMsR0FBRztNQUNoQkMsSUFBSSxFQUFFLFdBQVc7TUFDakJDLElBQUksRUFBRSxDQUFDO01BQ1BDLFNBQVMsRUFBRTtJQUNiLENBQUM7SUFFRFIsZUFBZSxDQUFDUywrQkFBK0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQ0MsT0FBTyxFQUFFQyxJQUFJLEVBQUVDLElBQUksS0FBSztNQUN0RixNQUFNO1FBQUVOLElBQUk7UUFBRUMsSUFBSTtRQUFFQztNQUFVLENBQUMsR0FBR0gsU0FBUztNQUMzQyxJQUFJRyxTQUFTLEVBQUU7UUFDYkcsSUFBSSxDQUFDRSxXQUFXLGFBQU1GLElBQUksQ0FBQ0UsV0FBVyxJQUFJLEVBQUUsb0RBQXVDUCxJQUFJLGNBQUlDLElBQUksY0FBSUMsU0FBUyxtQkFBZTtNQUM3SCxDQUFDLE1BQU07UUFDTDtRQUNBO1FBQ0FHLElBQUksQ0FBQ0UsV0FBVyxhQUFNRixJQUFJLENBQUNFLFdBQVcsSUFBSSxFQUFFLGtFQUErRDtNQUM3RztJQUNGLENBQUMsQ0FBQzs7SUFFRjtJQUNBO0lBQ0EsTUFBTUMsS0FBSyxHQUFHYixJQUFJLENBQUNjLE1BQU0sQ0FBQ0MsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtNQUM1REMsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO01BQy9DZCxHQUFHO01BQ0hlLFFBQVEsRUFBRTtJQUNaLENBQUMsQ0FBQztJQUNGSixLQUFLLENBQUNLLEVBQUUsQ0FBQyxTQUFTLEVBQUUsUUFBb0I7TUFBQSxJQUFuQjtRQUFFQyxJQUFJO1FBQUVUO01BQUssQ0FBQztNQUNqQyxRQUFRUyxJQUFJO1FBQ1YsS0FBSyxXQUFXO1VBQ2RDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDakIsU0FBUyxFQUFFTSxJQUFJLENBQUM7VUFDOUIsSUFBSSxDQUFDTixTQUFTLENBQUNHLFNBQVMsRUFBRTtZQUN4QixNQUFNLElBQUlaLE1BQU0sQ0FBQzJCLEtBQUssQ0FBQyxHQUFHLEVBQUUsaUhBQWlILENBQUM7VUFDaEo7VUFDRjtRQUNBO1VBQ0VDLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDTCxJQUFJLEVBQUVULElBQUksQ0FBQztNQUFBO0lBRTdCLENBQUMsQ0FBQztJQUNGRyxLQUFLLENBQUNZLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDbEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQ0MsT0FBTyxDQUFDQyxLQUFLLElBQUk7TUFDeERDLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDRixLQUFLLEVBQUUsTUFBTTtRQUN4QmQsS0FBSyxDQUFDaUIsSUFBSSxFQUFFO01BQ2QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0VBQ0o7RUFFQSxTQUFTM0IsUUFBUSxHQUFJO0lBQUE7SUFDbkIsSUFBSUQsR0FBRyx1QkFBRzBCLE9BQU8sQ0FBQ0csR0FBRyxDQUFDQyxHQUFHLCtEQUFJSixPQUFPLENBQUMxQixHQUFHLEVBQUU7SUFDMUMsTUFBTStCLEtBQUssR0FBRy9CLEdBQUcsQ0FBQ2dDLE9BQU8sQ0FBQyxTQUFTLENBQUM7SUFDcEMsSUFBSUQsS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFO01BQ2hCL0IsR0FBRyxHQUFHQSxHQUFHLENBQUNpQyxTQUFTLENBQUMsQ0FBQyxFQUFFRixLQUFLLENBQUM7SUFDL0I7SUFDQSxPQUFPL0IsR0FBRztFQUNaO0FBQUMscUIiLCJmaWxlIjoiL3BhY2thZ2VzL3ZpdGVfYnVuZGxlci5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InXG5pbXBvcnQgeyBXZWJBcHBJbnRlcm5hbHMgfSBmcm9tICdtZXRlb3Ivd2ViYXBwJ1xuaW1wb3J0IHsgZm9yayB9IGZyb20gJ25vZGU6Y2hpbGRfcHJvY2VzcydcblxuaWYgKE1ldGVvci5pc0RldmVsb3BtZW50KSB7XG4gIGNvbnN0IGN3ZCA9IGd1ZXNzQ3dkKClcblxuICBjb25zdCB2aXRlU2V0dXAgPSB7XG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsXG4gICAgcG9ydDogMCxcbiAgICBlbnRyeUZpbGU6ICcnLFxuICB9XG5cbiAgV2ViQXBwSW50ZXJuYWxzLnJlZ2lzdGVyQm9pbGVycGxhdGVEYXRhQ2FsbGJhY2soJ21ldGVvci12aXRlJywgKHJlcXVlc3QsIGRhdGEsIGFyY2gpID0+IHtcbiAgICBjb25zdCB7IGhvc3QsIHBvcnQsIGVudHJ5RmlsZSB9ID0gdml0ZVNldHVwXG4gICAgaWYgKGVudHJ5RmlsZSkge1xuICAgICAgZGF0YS5keW5hbWljQm9keSA9IGAke2RhdGEuZHluYW1pY0JvZHkgfHwgXCJcIn1cXG48c2NyaXB0IHR5cGU9XCJtb2R1bGVcIiBzcmM9XCJodHRwOi8vJHtob3N0fToke3BvcnR9LyR7ZW50cnlGaWxlfVwiPjwvc2NyaXB0PlxcbmBcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVml0ZSBub3QgcmVhZHkgeWV0XG4gICAgICAvLyBSZWZyZXNoIHBhZ2UgYWZ0ZXIgc29tZSB0aW1lXG4gICAgICBkYXRhLmR5bmFtaWNCb2R5ID0gYCR7ZGF0YS5keW5hbWljQm9keSB8fCBcIlwifVxcbjxzY3JpcHQ+c2V0VGltZW91dCgoKSA9PiBsb2NhdGlvbi5yZWxvYWQoKSwgNTAwKTwvc2NyaXB0PlxcbmBcbiAgICB9XG4gIH0pXG5cbiAgLy8gVXNlIGEgd29ya2VyIHRvIHNraXAgcmVpZnkgYW5kIEZpYmVyc1xuICAvLyBVc2UgYSBjaGlsZCBwcm9jZXNzIGluc3RlYWQgb2Ygd29ya2VyIHRvIGF2b2lkIFdBU00vYXJjaGl2ZWQgdGhyZWFkcyBlcnJvclxuICBjb25zdCBjaGlsZCA9IGZvcmsoQXNzZXRzLmFic29sdXRlRmlsZVBhdGgoJ3dvcmtlci1kZXYubWpzJyksIHtcbiAgICBzdGRpbzogWydpbmhlcml0JywgJ2luaGVyaXQnLCAnaW5oZXJpdCcsICdpcGMnXSxcbiAgICBjd2QsXG4gICAgZGV0YWNoZWQ6IGZhbHNlLFxuICB9KVxuICBjaGlsZC5vbignbWVzc2FnZScsICh7IGtpbmQsIGRhdGEgfSkgPT4ge1xuICAgIHN3aXRjaCAoa2luZCkge1xuICAgICAgY2FzZSAndml0ZVNldHVwJzpcbiAgICAgICAgT2JqZWN0LmFzc2lnbih2aXRlU2V0dXAsIGRhdGEpXG4gICAgICAgIGlmICghdml0ZVNldHVwLmVudHJ5RmlsZSkge1xuICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNTAwLCAnTWlzc2luZyBgbWV0ZW9yLmNsaWVudEVudHJ5YCB3aXRoIHBhdGggdG8gZW50cnkgZmlsZSAodGhlIG9uZSB5b3Ugd2FudCB0byBidWlsZCB3aXRoIFZpdGUpIGluIHlvdXIgdml0ZSBjb25maWcuJylcbiAgICAgICAgfVxuICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnNvbGUubG9nKGtpbmQsIGRhdGEpXG4gICAgfVxuICB9KVxuICBjaGlsZC5zZW5kKCdzdGFydCcpXG4gIDtbJ2V4aXQnLCAnU0lHSU5UJywgJ1NJR0hVUCcsICdTSUdURVJNJ10uZm9yRWFjaChldmVudCA9PiB7XG4gICAgcHJvY2Vzcy5vbmNlKGV2ZW50LCAoKSA9PiB7XG4gICAgICBjaGlsZC5raWxsKClcbiAgICB9KVxuICB9KVxufVxuXG5mdW5jdGlvbiBndWVzc0N3ZCAoKSB7XG4gIGxldCBjd2QgPSBwcm9jZXNzLmVudi5QV0QgPz8gcHJvY2Vzcy5jd2QoKVxuICBjb25zdCBpbmRleCA9IGN3ZC5pbmRleE9mKCcubWV0ZW9yJylcbiAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgIGN3ZCA9IGN3ZC5zdWJzdHJpbmcoMCwgaW5kZXgpXG4gIH1cbiAgcmV0dXJuIGN3ZFxufVxuIl19
