(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var _ = Package.underscore._;
var RoutePolicy = Package.routepolicy.RoutePolicy;
var Boilerplate = Package['boilerplate-generator'].Boilerplate;
var WebAppHashing = Package['webapp-hashing'].WebAppHashing;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var WebApp, WebAppInternals, main;

var require = meteorInstall({"node_modules":{"meteor":{"webapp":{"webapp_server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// packages/webapp/webapp_server.js                                                                       //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  module1.export({
    WebApp: () => WebApp,
    WebAppInternals: () => WebAppInternals
  });
  let assert;
  module1.link("assert", {
    default(v) {
      assert = v;
    }
  }, 0);
  let readFileSync, chmodSync, chownSync;
  module1.link("fs", {
    readFileSync(v) {
      readFileSync = v;
    },
    chmodSync(v) {
      chmodSync = v;
    },
    chownSync(v) {
      chownSync = v;
    }
  }, 1);
  let createServer;
  module1.link("http", {
    createServer(v) {
      createServer = v;
    }
  }, 2);
  let userInfo;
  module1.link("os", {
    userInfo(v) {
      userInfo = v;
    }
  }, 3);
  let pathJoin, pathDirname;
  module1.link("path", {
    join(v) {
      pathJoin = v;
    },
    dirname(v) {
      pathDirname = v;
    }
  }, 4);
  let parseUrl;
  module1.link("url", {
    parse(v) {
      parseUrl = v;
    }
  }, 5);
  let createHash;
  module1.link("crypto", {
    createHash(v) {
      createHash = v;
    }
  }, 6);
  let connect;
  module1.link("./connect.js", {
    connect(v) {
      connect = v;
    }
  }, 7);
  let compress;
  module1.link("compression", {
    default(v) {
      compress = v;
    }
  }, 8);
  let cookieParser;
  module1.link("cookie-parser", {
    default(v) {
      cookieParser = v;
    }
  }, 9);
  let qs;
  module1.link("qs", {
    default(v) {
      qs = v;
    }
  }, 10);
  let parseRequest;
  module1.link("parseurl", {
    default(v) {
      parseRequest = v;
    }
  }, 11);
  let basicAuth;
  module1.link("basic-auth-connect", {
    default(v) {
      basicAuth = v;
    }
  }, 12);
  let lookupUserAgent;
  module1.link("useragent", {
    lookup(v) {
      lookupUserAgent = v;
    }
  }, 13);
  let isModern;
  module1.link("meteor/modern-browsers", {
    isModern(v) {
      isModern = v;
    }
  }, 14);
  let send;
  module1.link("send", {
    default(v) {
      send = v;
    }
  }, 15);
  let removeExistingSocketFile, registerSocketFileCleanup;
  module1.link("./socket_file.js", {
    removeExistingSocketFile(v) {
      removeExistingSocketFile = v;
    },
    registerSocketFileCleanup(v) {
      registerSocketFileCleanup = v;
    }
  }, 16);
  let cluster;
  module1.link("cluster", {
    default(v) {
      cluster = v;
    }
  }, 17);
  let whomst;
  module1.link("@vlasky/whomst", {
    default(v) {
      whomst = v;
    }
  }, 18);
  let onMessage;
  module1.link("meteor/inter-process-messaging", {
    onMessage(v) {
      onMessage = v;
    }
  }, 19);
  var SHORT_SOCKET_TIMEOUT = 5 * 1000;
  var LONG_SOCKET_TIMEOUT = 120 * 1000;
  const WebApp = {};
  const WebAppInternals = {};
  const hasOwn = Object.prototype.hasOwnProperty;

  // backwards compat to 2.0 of connect
  connect.basicAuth = basicAuth;
  WebAppInternals.NpmModules = {
    connect: {
      version: Npm.require('connect/package.json').version,
      module: connect
    }
  };

  // Though we might prefer to use web.browser (modern) as the default
  // architecture, safety requires a more compatible defaultArch.
  WebApp.defaultArch = 'web.browser.legacy';

  // XXX maps archs to manifests
  WebApp.clientPrograms = {};

  // XXX maps archs to program path on filesystem
  var archPath = {};
  var bundledJsCssUrlRewriteHook = function (url) {
    var bundledPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
    return bundledPrefix + url;
  };
  var sha1 = function (contents) {
    var hash = createHash('sha1');
    hash.update(contents);
    return hash.digest('hex');
  };
  function shouldCompress(req, res) {
    if (req.headers['x-no-compression']) {
      // don't compress responses with this request header
      return false;
    }

    // fallback to standard filter function
    return compress.filter(req, res);
  }

  // #BrowserIdentification
  //
  // We have multiple places that want to identify the browser: the
  // unsupported browser page, the appcache package, and, eventually
  // delivering browser polyfills only as needed.
  //
  // To avoid detecting the browser in multiple places ad-hoc, we create a
  // Meteor "browser" object. It uses but does not expose the npm
  // useragent module (we could choose a different mechanism to identify
  // the browser in the future if we wanted to).  The browser object
  // contains
  //
  // * `name`: the name of the browser in camel case
  // * `major`, `minor`, `patch`: integers describing the browser version
  //
  // Also here is an early version of a Meteor `request` object, intended
  // to be a high-level description of the request without exposing
  // details of connect's low-level `req`.  Currently it contains:
  //
  // * `browser`: browser identification object described above
  // * `url`: parsed url, including parsed query params
  //
  // As a temporary hack there is a `categorizeRequest` function on WebApp which
  // converts a connect `req` to a Meteor `request`. This can go away once smart
  // packages such as appcache are being passed a `request` object directly when
  // they serve content.
  //
  // This allows `request` to be used uniformly: it is passed to the html
  // attributes hook, and the appcache package can use it when deciding
  // whether to generate a 404 for the manifest.
  //
  // Real routing / server side rendering will probably refactor this
  // heavily.

  // e.g. "Mobile Safari" => "mobileSafari"
  var camelCase = function (name) {
    var parts = name.split(' ');
    parts[0] = parts[0].toLowerCase();
    for (var i = 1; i < parts.length; ++i) {
      parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substr(1);
    }
    return parts.join('');
  };
  var identifyBrowser = function (userAgentString) {
    var userAgent = lookupUserAgent(userAgentString);
    return {
      name: camelCase(userAgent.family),
      major: +userAgent.major,
      minor: +userAgent.minor,
      patch: +userAgent.patch
    };
  };

  // XXX Refactor as part of implementing real routing.
  WebAppInternals.identifyBrowser = identifyBrowser;
  WebApp.categorizeRequest = function (req) {
    if (req.browser && req.arch && typeof req.modern === 'boolean') {
      // Already categorized.
      return req;
    }
    const browser = identifyBrowser(req.headers['user-agent']);
    const modern = isModern(browser);
    const path = typeof req.pathname === 'string' ? req.pathname : parseRequest(req).pathname;
    const categorized = {
      browser,
      modern,
      path,
      arch: WebApp.defaultArch,
      url: parseUrl(req.url, true),
      dynamicHead: req.dynamicHead,
      dynamicBody: req.dynamicBody,
      headers: req.headers,
      cookies: req.cookies
    };
    const pathParts = path.split('/');
    const archKey = pathParts[1];
    if (archKey.startsWith('__')) {
      const archCleaned = 'web.' + archKey.slice(2);
      if (hasOwn.call(WebApp.clientPrograms, archCleaned)) {
        pathParts.splice(1, 1); // Remove the archKey part.
        return Object.assign(categorized, {
          arch: archCleaned,
          path: pathParts.join('/')
        });
      }
    }

    // TODO Perhaps one day we could infer Cordova clients here, so that we
    // wouldn't have to use prefixed "/__cordova/..." URLs.
    const preferredArchOrder = isModern(browser) ? ['web.browser', 'web.browser.legacy'] : ['web.browser.legacy', 'web.browser'];
    for (const arch of preferredArchOrder) {
      // If our preferred arch is not available, it's better to use another
      // client arch that is available than to guarantee the site won't work
      // by returning an unknown arch. For example, if web.browser.legacy is
      // excluded using the --exclude-archs command-line option, legacy
      // clients are better off receiving web.browser (which might actually
      // work) than receiving an HTTP 404 response. If none of the archs in
      // preferredArchOrder are defined, only then should we send a 404.
      if (hasOwn.call(WebApp.clientPrograms, arch)) {
        return Object.assign(categorized, {
          arch
        });
      }
    }
    return categorized;
  };

  // HTML attribute hooks: functions to be called to determine any attributes to
  // be added to the '<html>' tag. Each function is passed a 'request' object (see
  // #BrowserIdentification) and should return null or object.
  var htmlAttributeHooks = [];
  var getHtmlAttributes = function (request) {
    var combinedAttributes = {};
    _.each(htmlAttributeHooks || [], function (hook) {
      var attributes = hook(request);
      if (attributes === null) return;
      if (typeof attributes !== 'object') throw Error('HTML attribute hook must return null or object');
      _.extend(combinedAttributes, attributes);
    });
    return combinedAttributes;
  };
  WebApp.addHtmlAttributeHook = function (hook) {
    htmlAttributeHooks.push(hook);
  };

  // Serve app HTML for this URL?
  var appUrl = function (url) {
    if (url === '/favicon.ico' || url === '/robots.txt') return false;

    // NOTE: app.manifest is not a web standard like favicon.ico and
    // robots.txt. It is a file name we have chosen to use for HTML5
    // appcache URLs. It is included here to prevent using an appcache
    // then removing it from poisoning an app permanently. Eventually,
    // once we have server side routing, this won't be needed as
    // unknown URLs with return a 404 automatically.
    if (url === '/app.manifest') return false;

    // Avoid serving app HTML for declared routes such as /sockjs/.
    if (RoutePolicy.classify(url)) return false;

    // we currently return app HTML on all URLs by default
    return true;
  };

  // We need to calculate the client hash after all packages have loaded
  // to give them a chance to populate __meteor_runtime_config__.
  //
  // Calculating the hash during startup means that packages can only
  // populate __meteor_runtime_config__ during load, not during startup.
  //
  // Calculating instead it at the beginning of main after all startup
  // hooks had run would allow packages to also populate
  // __meteor_runtime_config__ during startup, but that's too late for
  // autoupdate because it needs to have the client hash at startup to
  // insert the auto update version itself into
  // __meteor_runtime_config__ to get it to the client.
  //
  // An alternative would be to give autoupdate a "post-start,
  // pre-listen" hook to allow it to insert the auto update version at
  // the right moment.

  Meteor.startup(function () {
    function getter(key) {
      return function (arch) {
        arch = arch || WebApp.defaultArch;
        const program = WebApp.clientPrograms[arch];
        const value = program && program[key];
        // If this is the first time we have calculated this hash,
        // program[key] will be a thunk (lazy function with no parameters)
        // that we should call to do the actual computation.
        return typeof value === 'function' ? program[key] = value() : value;
      };
    }
    WebApp.calculateClientHash = WebApp.clientHash = getter('version');
    WebApp.calculateClientHashRefreshable = getter('versionRefreshable');
    WebApp.calculateClientHashNonRefreshable = getter('versionNonRefreshable');
    WebApp.calculateClientHashReplaceable = getter('versionReplaceable');
    WebApp.getRefreshableAssets = getter('refreshableAssets');
  });

  // When we have a request pending, we want the socket timeout to be long, to
  // give ourselves a while to serve it, and to allow sockjs long polls to
  // complete.  On the other hand, we want to close idle sockets relatively
  // quickly, so that we can shut down relatively promptly but cleanly, without
  // cutting off anyone's response.
  WebApp._timeoutAdjustmentRequestCallback = function (req, res) {
    // this is really just req.socket.setTimeout(LONG_SOCKET_TIMEOUT);
    req.setTimeout(LONG_SOCKET_TIMEOUT);
    // Insert our new finish listener to run BEFORE the existing one which removes
    // the response from the socket.
    var finishListeners = res.listeners('finish');
    // XXX Apparently in Node 0.12 this event was called 'prefinish'.
    // https://github.com/joyent/node/commit/7c9b6070
    // But it has switched back to 'finish' in Node v4:
    // https://github.com/nodejs/node/pull/1411
    res.removeAllListeners('finish');
    res.on('finish', function () {
      res.setTimeout(SHORT_SOCKET_TIMEOUT);
    });
    _.each(finishListeners, function (l) {
      res.on('finish', l);
    });
  };

  // Will be updated by main before we listen.
  // Map from client arch to boilerplate object.
  // Boilerplate object has:
  //   - func: XXX
  //   - baseData: XXX
  var boilerplateByArch = {};

  // Register a callback function that can selectively modify boilerplate
  // data given arguments (request, data, arch). The key should be a unique
  // identifier, to prevent accumulating duplicate callbacks from the same
  // call site over time. Callbacks will be called in the order they were
  // registered. A callback should return false if it did not make any
  // changes affecting the boilerplate. Passing null deletes the callback.
  // Any previous callback registered for this key will be returned.
  const boilerplateDataCallbacks = Object.create(null);
  WebAppInternals.registerBoilerplateDataCallback = function (key, callback) {
    const previousCallback = boilerplateDataCallbacks[key];
    if (typeof callback === 'function') {
      boilerplateDataCallbacks[key] = callback;
    } else {
      assert.strictEqual(callback, null);
      delete boilerplateDataCallbacks[key];
    }

    // Return the previous callback in case the new callback needs to call
    // it; for example, when the new callback is a wrapper for the old.
    return previousCallback || null;
  };

  // Given a request (as returned from `categorizeRequest`), return the
  // boilerplate HTML to serve for that request.
  //
  // If a previous connect middleware has rendered content for the head or body,
  // returns the boilerplate with that content patched in otherwise
  // memoizes on HTML attributes (used by, eg, appcache) and whether inline
  // scripts are currently allowed.
  // XXX so far this function is always called with arch === 'web.browser'
  function getBoilerplate(request, arch) {
    return getBoilerplateAsync(request, arch).await();
  }

  /**
   * @summary Takes a runtime configuration object and
   * returns an encoded runtime string.
   * @locus Server
   * @param {Object} rtimeConfig
   * @returns {String}
   */
  WebApp.encodeRuntimeConfig = function (rtimeConfig) {
    return JSON.stringify(encodeURIComponent(JSON.stringify(rtimeConfig)));
  };

  /**
   * @summary Takes an encoded runtime string and returns
   * a runtime configuration object.
   * @locus Server
   * @param {String} rtimeConfigString
   * @returns {Object}
   */
  WebApp.decodeRuntimeConfig = function (rtimeConfigStr) {
    return JSON.parse(decodeURIComponent(JSON.parse(rtimeConfigStr)));
  };
  const runtimeConfig = {
    // hooks will contain the callback functions
    // set by the caller to addRuntimeConfigHook
    hooks: new Hook(),
    // updateHooks will contain the callback functions
    // set by the caller to addUpdatedNotifyHook
    updateHooks: new Hook(),
    // isUpdatedByArch is an object containing fields for each arch
    // that this server supports.
    // - Each field will be true when the server updates the runtimeConfig for that arch.
    // - When the hook callback is called the update field in the callback object will be
    // set to isUpdatedByArch[arch].
    // = isUpdatedyByArch[arch] is reset to false after the callback.
    // This enables the caller to cache data efficiently so they do not need to
    // decode & update data on every callback when the runtimeConfig is not changing.
    isUpdatedByArch: {}
  };

  /**
   * @name addRuntimeConfigHookCallback(options)
   * @locus Server
   * @isprototype true
   * @summary Callback for `addRuntimeConfigHook`.
   *
   * If the handler returns a _falsy_ value the hook will not
   * modify the runtime configuration.
   *
   * If the handler returns a _String_ the hook will substitute
   * the string for the encoded configuration string.
   *
   * **Warning:** the hook does not check the return value at all it is
   * the responsibility of the caller to get the formatting correct using
   * the helper functions.
   *
   * `addRuntimeConfigHookCallback` takes only one `Object` argument
   * with the following fields:
   * @param {Object} options
   * @param {String} options.arch The architecture of the client
   * requesting a new runtime configuration. This can be one of
   * `web.browser`, `web.browser.legacy` or `web.cordova`.
   * @param {Object} options.request
   * A NodeJs [IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
   * https://nodejs.org/api/http.html#http_class_http_incomingmessage
   * `Object` that can be used to get information about the incoming request.
   * @param {String} options.encodedCurrentConfig The current configuration object
   * encoded as a string for inclusion in the root html.
   * @param {Boolean} options.updated `true` if the config for this architecture
   * has been updated since last called, otherwise `false`. This flag can be used
   * to cache the decoding/encoding for each architecture.
   */

  /**
   * @summary Hook that calls back when the meteor runtime configuration,
   * `__meteor_runtime_config__` is being sent to any client.
   *
   * **returns**: <small>_Object_</small> `{ stop: function, callback: function }`
   * - `stop` <small>_Function_</small> Call `stop()` to stop getting callbacks.
   * - `callback` <small>_Function_</small> The passed in `callback`.
   * @locus Server
   * @param {addRuntimeConfigHookCallback} callback
   * See `addRuntimeConfigHookCallback` description.
   * @returns {Object} {{ stop: function, callback: function }}
   * Call the returned `stop()` to stop getting callbacks.
   * The passed in `callback` is returned also.
   */
  WebApp.addRuntimeConfigHook = function (callback) {
    return runtimeConfig.hooks.register(callback);
  };
  function getBoilerplateAsync(request, arch) {
    let boilerplate = boilerplateByArch[arch];
    runtimeConfig.hooks.forEach(hook => {
      const meteorRuntimeConfig = hook({
        arch,
        request,
        encodedCurrentConfig: boilerplate.baseData.meteorRuntimeConfig,
        updated: runtimeConfig.isUpdatedByArch[arch]
      });
      if (!meteorRuntimeConfig) return true;
      boilerplate.baseData = Object.assign({}, boilerplate.baseData, {
        meteorRuntimeConfig
      });
      return true;
    });
    runtimeConfig.isUpdatedByArch[arch] = false;
    const data = Object.assign({}, boilerplate.baseData, {
      htmlAttributes: getHtmlAttributes(request)
    }, _.pick(request, 'dynamicHead', 'dynamicBody'));
    let madeChanges = false;
    let promise = Promise.resolve();
    Object.keys(boilerplateDataCallbacks).forEach(key => {
      promise = promise.then(() => {
        const callback = boilerplateDataCallbacks[key];
        return callback(request, data, arch);
      }).then(result => {
        // Callbacks should return false if they did not make any changes.
        if (result !== false) {
          madeChanges = true;
        }
      });
    });
    return promise.then(() => ({
      stream: boilerplate.toHTMLStream(data),
      statusCode: data.statusCode,
      headers: data.headers
    }));
  }

  /**
   * @name addUpdatedNotifyHookCallback(options)
   * @summary callback handler for `addupdatedNotifyHook`
   * @isprototype true
   * @locus Server
   * @param {Object} options
   * @param {String} options.arch The architecture that is being updated.
   * This can be one of `web.browser`, `web.browser.legacy` or `web.cordova`.
   * @param {Object} options.manifest The new updated manifest object for
   * this `arch`.
   * @param {Object} options.runtimeConfig The new updated configuration
   * object for this `arch`.
   */

  /**
   * @summary Hook that runs when the meteor runtime configuration
   * is updated.  Typically the configuration only changes during development mode.
   * @locus Server
   * @param {addUpdatedNotifyHookCallback} handler
   * The `handler` is called on every change to an `arch` runtime configuration.
   * See `addUpdatedNotifyHookCallback`.
   * @returns {Object} {{ stop: function, callback: function }}
   */
  WebApp.addUpdatedNotifyHook = function (handler) {
    return runtimeConfig.updateHooks.register(handler);
  };
  WebAppInternals.generateBoilerplateInstance = function (arch, manifest, additionalOptions) {
    additionalOptions = additionalOptions || {};
    runtimeConfig.isUpdatedByArch[arch] = true;
    const rtimeConfig = _objectSpread(_objectSpread({}, __meteor_runtime_config__), additionalOptions.runtimeConfigOverrides || {});
    runtimeConfig.updateHooks.forEach(cb => {
      cb({
        arch,
        manifest,
        runtimeConfig: rtimeConfig
      });
      return true;
    });
    const meteorRuntimeConfig = JSON.stringify(encodeURIComponent(JSON.stringify(rtimeConfig)));
    return new Boilerplate(arch, manifest, Object.assign({
      pathMapper(itemPath) {
        return pathJoin(archPath[arch], itemPath);
      },
      baseDataExtension: {
        additionalStaticJs: _.map(additionalStaticJs || [], function (contents, pathname) {
          return {
            pathname: pathname,
            contents: contents
          };
        }),
        // Convert to a JSON string, then get rid of most weird characters, then
        // wrap in double quotes. (The outermost JSON.stringify really ought to
        // just be "wrap in double quotes" but we use it to be safe.) This might
        // end up inside a <script> tag so we need to be careful to not include
        // "</script>", but normal {{spacebars}} escaping escapes too much! See
        // https://github.com/meteor/meteor/issues/3730
        meteorRuntimeConfig,
        meteorRuntimeHash: sha1(meteorRuntimeConfig),
        rootUrlPathPrefix: __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '',
        bundledJsCssUrlRewriteHook: bundledJsCssUrlRewriteHook,
        sriMode: sriMode,
        inlineScriptsAllowed: WebAppInternals.inlineScriptsAllowed(),
        inline: additionalOptions.inline
      }
    }, additionalOptions));
  };

  // A mapping from url path to architecture (e.g. "web.browser") to static
  // file information with the following fields:
  // - type: the type of file to be served
  // - cacheable: optionally, whether the file should be cached or not
  // - sourceMapUrl: optionally, the url of the source map
  //
  // Info also contains one of the following:
  // - content: the stringified content that should be served at this path
  // - absolutePath: the absolute path on disk to the file

  // Serve static files from the manifest or added with
  // `addStaticJs`. Exported for tests.
  WebAppInternals.staticFilesMiddleware = function (staticFilesByArch, req, res, next) {
    return Promise.asyncApply(() => {
      var _Meteor$settings$pack3, _Meteor$settings$pack4;
      var pathname = parseRequest(req).pathname;
      try {
        pathname = decodeURIComponent(pathname);
      } catch (e) {
        next();
        return;
      }
      var serveStaticJs = function (s) {
        var _Meteor$settings$pack, _Meteor$settings$pack2;
        if (req.method === 'GET' || req.method === 'HEAD' || (_Meteor$settings$pack = Meteor.settings.packages) !== null && _Meteor$settings$pack !== void 0 && (_Meteor$settings$pack2 = _Meteor$settings$pack.webapp) !== null && _Meteor$settings$pack2 !== void 0 && _Meteor$settings$pack2.alwaysReturnContent) {
          res.writeHead(200, {
            'Content-type': 'application/javascript; charset=UTF-8',
            'Content-Length': Buffer.byteLength(s)
          });
          res.write(s);
          res.end();
        } else {
          const status = req.method === 'OPTIONS' ? 200 : 405;
          res.writeHead(status, {
            Allow: 'OPTIONS, GET, HEAD',
            'Content-Length': '0'
          });
          res.end();
        }
      };
      if (_.has(additionalStaticJs, pathname) && !WebAppInternals.inlineScriptsAllowed()) {
        serveStaticJs(additionalStaticJs[pathname]);
        return;
      }
      const {
        arch,
        path
      } = WebApp.categorizeRequest(req);
      if (!hasOwn.call(WebApp.clientPrograms, arch)) {
        // We could come here in case we run with some architectures excluded
        next();
        return;
      }

      // If pauseClient(arch) has been called, program.paused will be a
      // Promise that will be resolved when the program is unpaused.
      const program = WebApp.clientPrograms[arch];
      Promise.await(program.paused);
      if (path === '/meteor_runtime_config.js' && !WebAppInternals.inlineScriptsAllowed()) {
        serveStaticJs("__meteor_runtime_config__ = ".concat(program.meteorRuntimeConfig, ";"));
        return;
      }
      const info = getStaticFileInfo(staticFilesByArch, pathname, path, arch);
      if (!info) {
        next();
        return;
      }
      // "send" will handle HEAD & GET requests
      if (req.method !== 'HEAD' && req.method !== 'GET' && !((_Meteor$settings$pack3 = Meteor.settings.packages) !== null && _Meteor$settings$pack3 !== void 0 && (_Meteor$settings$pack4 = _Meteor$settings$pack3.webapp) !== null && _Meteor$settings$pack4 !== void 0 && _Meteor$settings$pack4.alwaysReturnContent)) {
        const status = req.method === 'OPTIONS' ? 200 : 405;
        res.writeHead(status, {
          Allow: 'OPTIONS, GET, HEAD',
          'Content-Length': '0'
        });
        res.end();
        return;
      }

      // We don't need to call pause because, unlike 'static', once we call into
      // 'send' and yield to the event loop, we never call another handler with
      // 'next'.

      // Cacheable files are files that should never change. Typically
      // named by their hash (eg meteor bundled js and css files).
      // We cache them ~forever (1yr).
      const maxAge = info.cacheable ? 1000 * 60 * 60 * 24 * 365 : 0;
      if (info.cacheable) {
        // Since we use req.headers["user-agent"] to determine whether the
        // client should receive modern or legacy resources, tell the client
        // to invalidate cached resources when/if its user agent string
        // changes in the future.
        res.setHeader('Vary', 'User-Agent');
      }

      // Set the X-SourceMap header, which current Chrome, FireFox, and Safari
      // understand.  (The SourceMap header is slightly more spec-correct but FF
      // doesn't understand it.)
      //
      // You may also need to enable source maps in Chrome: open dev tools, click
      // the gear in the bottom right corner, and select "enable source maps".
      if (info.sourceMapUrl) {
        res.setHeader('X-SourceMap', __meteor_runtime_config__.ROOT_URL_PATH_PREFIX + info.sourceMapUrl);
      }
      if (info.type === 'js' || info.type === 'dynamic js') {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (info.type === 'css') {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      } else if (info.type === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      }
      if (info.hash) {
        res.setHeader('ETag', '"' + info.hash + '"');
      }
      if (info.content) {
        res.setHeader('Content-Length', Buffer.byteLength(info.content));
        res.write(info.content);
        res.end();
      } else {
        send(req, info.absolutePath, {
          maxage: maxAge,
          dotfiles: 'allow',
          // if we specified a dotfile in the manifest, serve it
          lastModified: false // don't set last-modified based on the file date
        }).on('error', function (err) {
          Log.error('Error serving static file ' + err);
          res.writeHead(500);
          res.end();
        }).on('directory', function () {
          Log.error('Unexpected directory ' + info.absolutePath);
          res.writeHead(500);
          res.end();
        }).pipe(res);
      }
    });
  };
  function getStaticFileInfo(staticFilesByArch, originalPath, path, arch) {
    if (!hasOwn.call(WebApp.clientPrograms, arch)) {
      return null;
    }

    // Get a list of all available static file architectures, with arch
    // first in the list if it exists.
    const staticArchList = Object.keys(staticFilesByArch);
    const archIndex = staticArchList.indexOf(arch);
    if (archIndex > 0) {
      staticArchList.unshift(staticArchList.splice(archIndex, 1)[0]);
    }
    let info = null;
    staticArchList.some(arch => {
      const staticFiles = staticFilesByArch[arch];
      function finalize(path) {
        info = staticFiles[path];
        // Sometimes we register a lazy function instead of actual data in
        // the staticFiles manifest.
        if (typeof info === 'function') {
          info = staticFiles[path] = info();
        }
        return info;
      }

      // If staticFiles contains originalPath with the arch inferred above,
      // use that information.
      if (hasOwn.call(staticFiles, originalPath)) {
        return finalize(originalPath);
      }

      // If categorizeRequest returned an alternate path, try that instead.
      if (path !== originalPath && hasOwn.call(staticFiles, path)) {
        return finalize(path);
      }
    });
    return info;
  }

  // Parse the passed in port value. Return the port as-is if it's a String
  // (e.g. a Windows Server style named pipe), otherwise return the port as an
  // integer.
  //
  // DEPRECATED: Direct use of this function is not recommended; it is no
  // longer used internally, and will be removed in a future release.
  WebAppInternals.parsePort = port => {
    let parsedPort = parseInt(port);
    if (Number.isNaN(parsedPort)) {
      parsedPort = port;
    }
    return parsedPort;
  };
  onMessage('webapp-pause-client', _ref => Promise.asyncApply(() => {
    let {
      arch
    } = _ref;
    WebAppInternals.pauseClient(arch);
  }));
  onMessage('webapp-reload-client', _ref2 => Promise.asyncApply(() => {
    let {
      arch
    } = _ref2;
    WebAppInternals.generateClientProgram(arch);
  }));
  function runWebAppServer() {
    var shuttingDown = false;
    var syncQueue = new Meteor._SynchronousQueue();
    var getItemPathname = function (itemUrl) {
      return decodeURIComponent(parseUrl(itemUrl).pathname);
    };
    WebAppInternals.reloadClientPrograms = function () {
      syncQueue.runTask(function () {
        const staticFilesByArch = Object.create(null);
        const {
          configJson
        } = __meteor_bootstrap__;
        const clientArchs = configJson.clientArchs || Object.keys(configJson.clientPaths);
        try {
          clientArchs.forEach(arch => {
            generateClientProgram(arch, staticFilesByArch);
          });
          WebAppInternals.staticFilesByArch = staticFilesByArch;
        } catch (e) {
          Log.error('Error reloading the client program: ' + e.stack);
          process.exit(1);
        }
      });
    };

    // Pause any incoming requests and make them wait for the program to be
    // unpaused the next time generateClientProgram(arch) is called.
    WebAppInternals.pauseClient = function (arch) {
      syncQueue.runTask(() => {
        const program = WebApp.clientPrograms[arch];
        const {
          unpause
        } = program;
        program.paused = new Promise(resolve => {
          if (typeof unpause === 'function') {
            // If there happens to be an existing program.unpause function,
            // compose it with the resolve function.
            program.unpause = function () {
              unpause();
              resolve();
            };
          } else {
            program.unpause = resolve;
          }
        });
      });
    };
    WebAppInternals.generateClientProgram = function (arch) {
      syncQueue.runTask(() => generateClientProgram(arch));
    };
    function generateClientProgram(arch) {
      let staticFilesByArch = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : WebAppInternals.staticFilesByArch;
      const clientDir = pathJoin(pathDirname(__meteor_bootstrap__.serverDir), arch);

      // read the control for the client we'll be serving up
      const programJsonPath = pathJoin(clientDir, 'program.json');
      let programJson;
      try {
        programJson = JSON.parse(readFileSync(programJsonPath));
      } catch (e) {
        if (e.code === 'ENOENT') return;
        throw e;
      }
      if (programJson.format !== 'web-program-pre1') {
        throw new Error('Unsupported format for client assets: ' + JSON.stringify(programJson.format));
      }
      if (!programJsonPath || !clientDir || !programJson) {
        throw new Error('Client config file not parsed.');
      }
      archPath[arch] = clientDir;
      const staticFiles = staticFilesByArch[arch] = Object.create(null);
      const {
        manifest
      } = programJson;
      manifest.forEach(item => {
        if (item.url && item.where === 'client') {
          staticFiles[getItemPathname(item.url)] = {
            absolutePath: pathJoin(clientDir, item.path),
            cacheable: item.cacheable,
            hash: item.hash,
            // Link from source to its map
            sourceMapUrl: item.sourceMapUrl,
            type: item.type
          };
          if (item.sourceMap) {
            // Serve the source map too, under the specified URL. We assume
            // all source maps are cacheable.
            staticFiles[getItemPathname(item.sourceMapUrl)] = {
              absolutePath: pathJoin(clientDir, item.sourceMap),
              cacheable: true
            };
          }
        }
      });
      const {
        PUBLIC_SETTINGS
      } = __meteor_runtime_config__;
      const configOverrides = {
        PUBLIC_SETTINGS
      };
      const oldProgram = WebApp.clientPrograms[arch];
      const newProgram = WebApp.clientPrograms[arch] = {
        format: 'web-program-pre1',
        manifest: manifest,
        // Use arrow functions so that these versions can be lazily
        // calculated later, and so that they will not be included in the
        // staticFiles[manifestUrl].content string below.
        //
        // Note: these version calculations must be kept in agreement with
        // CordovaBuilder#appendVersion in tools/cordova/builder.js, or hot
        // code push will reload Cordova apps unnecessarily.
        version: () => WebAppHashing.calculateClientHash(manifest, null, configOverrides),
        versionRefreshable: () => WebAppHashing.calculateClientHash(manifest, type => type === 'css', configOverrides),
        versionNonRefreshable: () => WebAppHashing.calculateClientHash(manifest, (type, replaceable) => type !== 'css' && !replaceable, configOverrides),
        versionReplaceable: () => WebAppHashing.calculateClientHash(manifest, (_type, replaceable) => replaceable, configOverrides),
        cordovaCompatibilityVersions: programJson.cordovaCompatibilityVersions,
        PUBLIC_SETTINGS,
        hmrVersion: programJson.hmrVersion
      };

      // Expose program details as a string reachable via the following URL.
      const manifestUrlPrefix = '/__' + arch.replace(/^web\./, '');
      const manifestUrl = manifestUrlPrefix + getItemPathname('/manifest.json');
      staticFiles[manifestUrl] = () => {
        if (Package.autoupdate) {
          const {
            AUTOUPDATE_VERSION = Package.autoupdate.Autoupdate.autoupdateVersion
          } = process.env;
          if (AUTOUPDATE_VERSION) {
            newProgram.version = AUTOUPDATE_VERSION;
          }
        }
        if (typeof newProgram.version === 'function') {
          newProgram.version = newProgram.version();
        }
        return {
          content: JSON.stringify(newProgram),
          cacheable: false,
          hash: newProgram.version,
          type: 'json'
        };
      };
      generateBoilerplateForArch(arch);

      // If there are any requests waiting on oldProgram.paused, let them
      // continue now (using the new program).
      if (oldProgram && oldProgram.paused) {
        oldProgram.unpause();
      }
    }
    const defaultOptionsForArch = {
      'web.cordova': {
        runtimeConfigOverrides: {
          // XXX We use absoluteUrl() here so that we serve https://
          // URLs to cordova clients if force-ssl is in use. If we were
          // to use __meteor_runtime_config__.ROOT_URL instead of
          // absoluteUrl(), then Cordova clients would immediately get a
          // HCP setting their DDP_DEFAULT_CONNECTION_URL to
          // http://example.meteor.com. This breaks the app, because
          // force-ssl doesn't serve CORS headers on 302
          // redirects. (Plus it's undesirable to have clients
          // connecting to http://example.meteor.com when force-ssl is
          // in use.)
          DDP_DEFAULT_CONNECTION_URL: process.env.MOBILE_DDP_URL || Meteor.absoluteUrl(),
          ROOT_URL: process.env.MOBILE_ROOT_URL || Meteor.absoluteUrl()
        }
      },
      'web.browser': {
        runtimeConfigOverrides: {
          isModern: true
        }
      },
      'web.browser.legacy': {
        runtimeConfigOverrides: {
          isModern: false
        }
      }
    };
    WebAppInternals.generateBoilerplate = function () {
      // This boilerplate will be served to the mobile devices when used with
      // Meteor/Cordova for the Hot-Code Push and since the file will be served by
      // the device's server, it is important to set the DDP url to the actual
      // Meteor server accepting DDP connections and not the device's file server.
      syncQueue.runTask(function () {
        Object.keys(WebApp.clientPrograms).forEach(generateBoilerplateForArch);
      });
    };
    function generateBoilerplateForArch(arch) {
      const program = WebApp.clientPrograms[arch];
      const additionalOptions = defaultOptionsForArch[arch] || {};
      const {
        baseData
      } = boilerplateByArch[arch] = WebAppInternals.generateBoilerplateInstance(arch, program.manifest, additionalOptions);
      // We need the runtime config with overrides for meteor_runtime_config.js:
      program.meteorRuntimeConfig = JSON.stringify(_objectSpread(_objectSpread({}, __meteor_runtime_config__), additionalOptions.runtimeConfigOverrides || null));
      program.refreshableAssets = baseData.css.map(file => ({
        url: bundledJsCssUrlRewriteHook(file.url)
      }));
    }
    WebAppInternals.reloadClientPrograms();

    // webserver
    var app = connect();

    // Packages and apps can add handlers that run before any other Meteor
    // handlers via WebApp.rawConnectHandlers.
    var rawConnectHandlers = connect();
    app.use(rawConnectHandlers);

    // Auto-compress any json, javascript, or text.
    app.use(compress({
      filter: shouldCompress
    }));

    // parse cookies into an object
    app.use(cookieParser());

    // We're not a proxy; reject (without crashing) attempts to treat us like
    // one. (See #1212.)
    app.use(function (req, res, next) {
      if (RoutePolicy.isValidUrl(req.url)) {
        next();
        return;
      }
      res.writeHead(400);
      res.write('Not a proxy');
      res.end();
    });

    // Parse the query string into res.query. Used by oauth_server, but it's
    // generally pretty handy..
    //
    // Do this before the next middleware destroys req.url if a path prefix
    // is set to close #10111.
    app.use(function (request, response, next) {
      request.query = qs.parse(parseUrl(request.url).query);
      next();
    });
    function getPathParts(path) {
      const parts = path.split('/');
      while (parts[0] === '') parts.shift();
      return parts;
    }
    function isPrefixOf(prefix, array) {
      return prefix.length <= array.length && prefix.every((part, i) => part === array[i]);
    }

    // Strip off the path prefix, if it exists.
    app.use(function (request, response, next) {
      const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
      const {
        pathname,
        search
      } = parseUrl(request.url);

      // check if the path in the url starts with the path prefix
      if (pathPrefix) {
        const prefixParts = getPathParts(pathPrefix);
        const pathParts = getPathParts(pathname);
        if (isPrefixOf(prefixParts, pathParts)) {
          request.url = '/' + pathParts.slice(prefixParts.length).join('/');
          if (search) {
            request.url += search;
          }
          return next();
        }
      }
      if (pathname === '/favicon.ico' || pathname === '/robots.txt') {
        return next();
      }
      if (pathPrefix) {
        response.writeHead(404);
        response.write('Unknown path');
        response.end();
        return;
      }
      next();
    });

    // Serve static files from the manifest.
    // This is inspired by the 'static' middleware.
    app.use(function (req, res, next) {
      WebAppInternals.staticFilesMiddleware(WebAppInternals.staticFilesByArch, req, res, next);
    });

    // Core Meteor packages like dynamic-import can add handlers before
    // other handlers added by package and application code.
    app.use(WebAppInternals.meteorInternalHandlers = connect());

    /**
     * @name connectHandlersCallback(req, res, next)
     * @locus Server
     * @isprototype true
     * @summary callback handler for `WebApp.connectHandlers`
     * @param {Object} req
     * a Node.js
     * [IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
     * object with some extra properties. This argument can be used
     *  to get information about the incoming request.
     * @param {Object} res
     * a Node.js
     * [ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse)
     * object. Use this to write data that should be sent in response to the
     * request, and call `res.end()` when you are done.
     * @param {Function} next
     * Calling this function will pass on the handling of
     * this request to the next relevant handler.
     *
     */

    /**
     * @method connectHandlers
     * @memberof WebApp
     * @locus Server
     * @summary Register a handler for all HTTP requests.
     * @param {String} [path]
     * This handler will only be called on paths that match
     * this string. The match has to border on a `/` or a `.`.
     *
     * For example, `/hello` will match `/hello/world` and
     * `/hello.world`, but not `/hello_world`.
     * @param {connectHandlersCallback} handler
     * A handler function that will be called on HTTP requests.
     * See `connectHandlersCallback`
     *
     */
    // Packages and apps can add handlers to this via WebApp.connectHandlers.
    // They are inserted before our default handler.
    var packageAndAppHandlers = connect();
    app.use(packageAndAppHandlers);
    var suppressConnectErrors = false;
    // connect knows it is an error handler because it has 4 arguments instead of
    // 3. go figure.  (It is not smart enough to find such a thing if it's hidden
    // inside packageAndAppHandlers.)
    app.use(function (err, req, res, next) {
      if (!err || !suppressConnectErrors || !req.headers['x-suppress-error']) {
        next(err);
        return;
      }
      res.writeHead(err.status, {
        'Content-Type': 'text/plain'
      });
      res.end('An error message');
    });
    app.use(function (req, res, next) {
      return Promise.asyncApply(() => {
        var _Meteor$settings$pack5, _Meteor$settings$pack6;
        if (!appUrl(req.url)) {
          return next();
        } else if (req.method !== 'HEAD' && req.method !== 'GET' && !((_Meteor$settings$pack5 = Meteor.settings.packages) !== null && _Meteor$settings$pack5 !== void 0 && (_Meteor$settings$pack6 = _Meteor$settings$pack5.webapp) !== null && _Meteor$settings$pack6 !== void 0 && _Meteor$settings$pack6.alwaysReturnContent)) {
          const status = req.method === 'OPTIONS' ? 200 : 405;
          res.writeHead(status, {
            Allow: 'OPTIONS, GET, HEAD',
            'Content-Length': '0'
          });
          res.end();
        } else {
          var headers = {
            'Content-Type': 'text/html; charset=utf-8'
          };
          if (shuttingDown) {
            headers['Connection'] = 'Close';
          }
          var request = WebApp.categorizeRequest(req);
          if (request.url.query && request.url.query['meteor_css_resource']) {
            // In this case, we're requesting a CSS resource in the meteor-specific
            // way, but we don't have it.  Serve a static css file that indicates that
            // we didn't have it, so we can detect that and refresh.  Make sure
            // that any proxies or CDNs don't cache this error!  (Normally proxies
            // or CDNs are smart enough not to cache error pages, but in order to
            // make this hack work, we need to return the CSS file as a 200, which
            // would otherwise be cached.)
            headers['Content-Type'] = 'text/css; charset=utf-8';
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(200, headers);
            res.write('.meteor-css-not-found-error { width: 0px;}');
            res.end();
            return;
          }
          if (request.url.query && request.url.query['meteor_js_resource']) {
            // Similarly, we're requesting a JS resource that we don't have.
            // Serve an uncached 404. (We can't use the same hack we use for CSS,
            // because actually acting on that hack requires us to have the JS
            // already!)
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            res.end('404 Not Found');
            return;
          }
          if (request.url.query && request.url.query['meteor_dont_serve_index']) {
            // When downloading files during a Cordova hot code push, we need
            // to detect if a file is not available instead of inadvertently
            // downloading the default index page.
            // So similar to the situation above, we serve an uncached 404.
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            res.end('404 Not Found');
            return;
          }
          const {
            arch
          } = request;
          assert.strictEqual(typeof arch, 'string', {
            arch
          });
          if (!hasOwn.call(WebApp.clientPrograms, arch)) {
            // We could come here in case we run with some architectures excluded
            headers['Cache-Control'] = 'no-cache';
            res.writeHead(404, headers);
            if (Meteor.isDevelopment) {
              res.end("No client program found for the ".concat(arch, " architecture."));
            } else {
              // Safety net, but this branch should not be possible.
              res.end('404 Not Found');
            }
            return;
          }

          // If pauseClient(arch) has been called, program.paused will be a
          // Promise that will be resolved when the program is unpaused.
          Promise.await(WebApp.clientPrograms[arch].paused);
          return getBoilerplateAsync(request, arch).then(_ref3 => {
            let {
              stream,
              statusCode,
              headers: newHeaders
            } = _ref3;
            if (!statusCode) {
              statusCode = res.statusCode ? res.statusCode : 200;
            }
            if (newHeaders) {
              Object.assign(headers, newHeaders);
            }
            res.writeHead(statusCode, headers);
            stream.pipe(res, {
              // End the response when the stream ends.
              end: true
            });
          }).catch(error => {
            Log.error('Error running template: ' + error.stack);
            res.writeHead(500, headers);
            res.end();
          });
        }
      });
    });

    // Return 404 by default, if no other handlers serve this URL.
    app.use(function (req, res) {
      res.writeHead(404);
      res.end();
    });
    var httpServer = createServer(app);
    var onListeningCallbacks = [];

    // After 5 seconds w/o data on a socket, kill it.  On the other hand, if
    // there's an outstanding request, give it a higher timeout instead (to avoid
    // killing long-polling requests)
    httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);

    // Do this here, and then also in livedata/stream_server.js, because
    // stream_server.js kills all the current request handlers when installing its
    // own.
    httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);

    // If the client gave us a bad request, tell it instead of just closing the
    // socket. This lets load balancers in front of us differentiate between "a
    // server is randomly closing sockets for no reason" and "client sent a bad
    // request".
    //
    // This will only work on Node 6; Node 4 destroys the socket before calling
    // this event. See https://github.com/nodejs/node/pull/4557/ for details.
    httpServer.on('clientError', (err, socket) => {
      // Pre-Node-6, do nothing.
      if (socket.destroyed) {
        return;
      }
      if (err.message === 'Parse Error') {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } else {
        // For other errors, use the default behavior as if we had no clientError
        // handler.
        socket.destroy(err);
      }
    });

    // start up app
    _.extend(WebApp, {
      connectHandlers: packageAndAppHandlers,
      rawConnectHandlers: rawConnectHandlers,
      httpServer: httpServer,
      connectApp: app,
      // For testing.
      suppressConnectErrors: function () {
        suppressConnectErrors = true;
      },
      onListening: function (f) {
        if (onListeningCallbacks) onListeningCallbacks.push(f);else f();
      },
      // This can be overridden by users who want to modify how listening works
      // (eg, to run a proxy like Apollo Engine Proxy in front of the server).
      startListening: function (httpServer, listenOptions, cb) {
        httpServer.listen(listenOptions, cb);
      }
    });

    /**
    * @name main
    * @locus Server
    * @summary Starts the HTTP server.
    *  If `UNIX_SOCKET_PATH` is present Meteor's HTTP server will use that socket file for inter-process communication, instead of TCP.
    * If you choose to not include webapp package in your application this method still must be defined for your Meteor application to work. 
    */
    // Let the rest of the packages (and Meteor.startup hooks) insert connect
    // middlewares and update __meteor_runtime_config__, then keep going to set up
    // actually serving HTML.
    exports.main = argv => {
      WebAppInternals.generateBoilerplate();
      const startHttpServer = listenOptions => {
        WebApp.startListening(httpServer, listenOptions, Meteor.bindEnvironment(() => {
          if (process.env.METEOR_PRINT_ON_LISTEN) {
            console.log('LISTENING');
          }
          const callbacks = onListeningCallbacks;
          onListeningCallbacks = null;
          callbacks.forEach(callback => {
            callback();
          });
        }, e => {
          console.error('Error listening:', e);
          console.error(e && e.stack);
        }));
      };
      let localPort = process.env.PORT || 0;
      let unixSocketPath = process.env.UNIX_SOCKET_PATH;
      if (unixSocketPath) {
        if (cluster.isWorker) {
          const workerName = cluster.worker.process.env.name || cluster.worker.id;
          unixSocketPath += '.' + workerName + '.sock';
        }
        // Start the HTTP server using a socket file.
        removeExistingSocketFile(unixSocketPath);
        startHttpServer({
          path: unixSocketPath
        });
        const unixSocketPermissions = (process.env.UNIX_SOCKET_PERMISSIONS || '').trim();
        if (unixSocketPermissions) {
          if (/^[0-7]{3}$/.test(unixSocketPermissions)) {
            chmodSync(unixSocketPath, parseInt(unixSocketPermissions, 8));
          } else {
            throw new Error('Invalid UNIX_SOCKET_PERMISSIONS specified');
          }
        }
        const unixSocketGroup = (process.env.UNIX_SOCKET_GROUP || '').trim();
        if (unixSocketGroup) {
          //whomst automatically handles both group names and numerical gids
          const unixSocketGroupInfo = whomst.sync.group(unixSocketGroup);
          if (unixSocketGroupInfo === null) {
            throw new Error('Invalid UNIX_SOCKET_GROUP name specified');
          }
          chownSync(unixSocketPath, userInfo().uid, unixSocketGroupInfo.gid);
        }
        registerSocketFileCleanup(unixSocketPath);
      } else {
        localPort = isNaN(Number(localPort)) ? localPort : Number(localPort);
        if (/\\\\?.+\\pipe\\?.+/.test(localPort)) {
          // Start the HTTP server using Windows Server style named pipe.
          startHttpServer({
            path: localPort
          });
        } else if (typeof localPort === 'number') {
          // Start the HTTP server using TCP.
          startHttpServer({
            port: localPort,
            host: process.env.BIND_IP || '0.0.0.0'
          });
        } else {
          throw new Error('Invalid PORT specified');
        }
      }
      return 'DAEMON';
    };
  }
  var inlineScriptsAllowed = true;
  WebAppInternals.inlineScriptsAllowed = function () {
    return inlineScriptsAllowed;
  };
  WebAppInternals.setInlineScriptsAllowed = function (value) {
    inlineScriptsAllowed = value;
    WebAppInternals.generateBoilerplate();
  };
  var sriMode;
  WebAppInternals.enableSubresourceIntegrity = function () {
    let use_credentials = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
    sriMode = use_credentials ? 'use-credentials' : 'anonymous';
    WebAppInternals.generateBoilerplate();
  };
  WebAppInternals.setBundledJsCssUrlRewriteHook = function (hookFn) {
    bundledJsCssUrlRewriteHook = hookFn;
    WebAppInternals.generateBoilerplate();
  };
  WebAppInternals.setBundledJsCssPrefix = function (prefix) {
    var self = this;
    self.setBundledJsCssUrlRewriteHook(function (url) {
      return prefix + url;
    });
  };

  // Packages can call `WebAppInternals.addStaticJs` to specify static
  // JavaScript to be included in the app. This static JS will be inlined,
  // unless inline scripts have been disabled, in which case it will be
  // served under `/<sha1 of contents>`.
  var additionalStaticJs = {};
  WebAppInternals.addStaticJs = function (contents) {
    additionalStaticJs['/' + sha1(contents) + '.js'] = contents;
  };

  // Exported for tests
  WebAppInternals.getBoilerplate = getBoilerplate;
  WebAppInternals.additionalStaticJs = additionalStaticJs;

  // Start the server!
  runWebAppServer();
}.call(this, module);
////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"connect.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// packages/webapp/connect.js                                                                             //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.export({
  connect: () => connect
});
let npmConnect;
module.link("connect", {
  default(v) {
    npmConnect = v;
  }
}, 0);
function connect() {
  for (var _len = arguments.length, connectArgs = new Array(_len), _key = 0; _key < _len; _key++) {
    connectArgs[_key] = arguments[_key];
  }
  const handlers = npmConnect.apply(this, connectArgs);
  const originalUse = handlers.use;

  // Wrap the handlers.use method so that any provided handler functions
  // always run in a Fiber.
  handlers.use = function use() {
    for (var _len2 = arguments.length, useArgs = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      useArgs[_key2] = arguments[_key2];
    }
    const {
      stack
    } = this;
    const originalLength = stack.length;
    const result = originalUse.apply(this, useArgs);

    // If we just added anything to the stack, wrap each new entry.handle
    // with a function that calls Promise.asyncApply to ensure the
    // original handler runs in a Fiber.
    for (let i = originalLength; i < stack.length; ++i) {
      const entry = stack[i];
      const originalHandle = entry.handle;
      if (originalHandle.length >= 4) {
        // If the original handle had four (or more) parameters, the
        // wrapper must also have four parameters, since connect uses
        // handle.length to determine whether to pass the error as the first
        // argument to the handle function.
        entry.handle = function handle(err, req, res, next) {
          return Promise.asyncApply(originalHandle, this, arguments);
        };
      } else {
        entry.handle = function handle(req, res, next) {
          return Promise.asyncApply(originalHandle, this, arguments);
        };
      }
    }
    return result;
  };
  return handlers;
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"socket_file.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// packages/webapp/socket_file.js                                                                         //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.export({
  removeExistingSocketFile: () => removeExistingSocketFile,
  registerSocketFileCleanup: () => registerSocketFileCleanup
});
let statSync, unlinkSync, existsSync;
module.link("fs", {
  statSync(v) {
    statSync = v;
  },
  unlinkSync(v) {
    unlinkSync = v;
  },
  existsSync(v) {
    existsSync = v;
  }
}, 0);
const removeExistingSocketFile = socketPath => {
  try {
    if (statSync(socketPath).isSocket()) {
      // Since a new socket file will be created, remove the existing
      // file.
      unlinkSync(socketPath);
    } else {
      throw new Error("An existing file was found at \"".concat(socketPath, "\" and it is not ") + 'a socket file. Please confirm PORT is pointing to valid and ' + 'un-used socket file path.');
    }
  } catch (error) {
    // If there is no existing socket file to cleanup, great, we'll
    // continue normally. If the caught exception represents any other
    // issue, re-throw.
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};
const registerSocketFileCleanup = function (socketPath) {
  let eventEmitter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : process;
  ['exit', 'SIGINT', 'SIGHUP', 'SIGTERM'].forEach(signal => {
    eventEmitter.on(signal, Meteor.bindEnvironment(() => {
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    }));
  });
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"connect":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/connect/package.json                                           //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "connect",
  "version": "3.7.0"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/connect/index.js                                               //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"compression":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/compression/package.json                                       //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "compression",
  "version": "1.7.4"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/compression/index.js                                           //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"cookie-parser":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/cookie-parser/package.json                                     //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "cookie-parser",
  "version": "1.4.5"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/cookie-parser/index.js                                         //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"qs":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/qs/package.json                                                //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "qs",
  "version": "6.10.1",
  "main": "lib/index.js"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"lib":{"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/qs/lib/index.js                                                //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}},"parseurl":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/parseurl/package.json                                          //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "parseurl",
  "version": "1.3.3"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/parseurl/index.js                                              //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"basic-auth-connect":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/basic-auth-connect/package.json                                //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "basic-auth-connect",
  "version": "1.0.0"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/basic-auth-connect/index.js                                    //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"useragent":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/useragent/package.json                                         //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "useragent",
  "version": "2.3.0",
  "main": "./index.js"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/useragent/index.js                                             //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"send":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/send/package.json                                              //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "send",
  "version": "0.17.1"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/send/index.js                                                  //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"@vlasky":{"whomst":{"package.json":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/@vlasky/whomst/package.json                                    //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.exports = {
  "name": "@vlasky/whomst",
  "version": "0.1.7",
  "main": "index.js"
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"index.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                        //
// node_modules/meteor/webapp/node_modules/@vlasky/whomst/index.js                                        //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                          //
module.useNode();
////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/webapp/webapp_server.js");

/* Exports */
Package._define("webapp", exports, {
  WebApp: WebApp,
  WebAppInternals: WebAppInternals,
  main: main
});

})();

//# sourceURL=meteor://💻app/packages/webapp.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvd2ViYXBwL3dlYmFwcF9zZXJ2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3dlYmFwcC9jb25uZWN0LmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy93ZWJhcHAvc29ja2V0X2ZpbGUuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZTEiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJleHBvcnQiLCJXZWJBcHAiLCJXZWJBcHBJbnRlcm5hbHMiLCJhc3NlcnQiLCJyZWFkRmlsZVN5bmMiLCJjaG1vZFN5bmMiLCJjaG93blN5bmMiLCJjcmVhdGVTZXJ2ZXIiLCJ1c2VySW5mbyIsInBhdGhKb2luIiwicGF0aERpcm5hbWUiLCJqb2luIiwiZGlybmFtZSIsInBhcnNlVXJsIiwicGFyc2UiLCJjcmVhdGVIYXNoIiwiY29ubmVjdCIsImNvbXByZXNzIiwiY29va2llUGFyc2VyIiwicXMiLCJwYXJzZVJlcXVlc3QiLCJiYXNpY0F1dGgiLCJsb29rdXBVc2VyQWdlbnQiLCJsb29rdXAiLCJpc01vZGVybiIsInNlbmQiLCJyZW1vdmVFeGlzdGluZ1NvY2tldEZpbGUiLCJyZWdpc3RlclNvY2tldEZpbGVDbGVhbnVwIiwiY2x1c3RlciIsIndob21zdCIsIm9uTWVzc2FnZSIsIlNIT1JUX1NPQ0tFVF9USU1FT1VUIiwiTE9OR19TT0NLRVRfVElNRU9VVCIsImhhc093biIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiTnBtTW9kdWxlcyIsInZlcnNpb24iLCJOcG0iLCJyZXF1aXJlIiwibW9kdWxlIiwiZGVmYXVsdEFyY2giLCJjbGllbnRQcm9ncmFtcyIsImFyY2hQYXRoIiwiYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2siLCJ1cmwiLCJidW5kbGVkUHJlZml4IiwiX19tZXRlb3JfcnVudGltZV9jb25maWdfXyIsIlJPT1RfVVJMX1BBVEhfUFJFRklYIiwic2hhMSIsImNvbnRlbnRzIiwiaGFzaCIsInVwZGF0ZSIsImRpZ2VzdCIsInNob3VsZENvbXByZXNzIiwicmVxIiwicmVzIiwiaGVhZGVycyIsImZpbHRlciIsImNhbWVsQ2FzZSIsIm5hbWUiLCJwYXJ0cyIsInNwbGl0IiwidG9Mb3dlckNhc2UiLCJpIiwibGVuZ3RoIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJzdWJzdHIiLCJpZGVudGlmeUJyb3dzZXIiLCJ1c2VyQWdlbnRTdHJpbmciLCJ1c2VyQWdlbnQiLCJmYW1pbHkiLCJtYWpvciIsIm1pbm9yIiwicGF0Y2giLCJjYXRlZ29yaXplUmVxdWVzdCIsImJyb3dzZXIiLCJhcmNoIiwibW9kZXJuIiwicGF0aCIsInBhdGhuYW1lIiwiY2F0ZWdvcml6ZWQiLCJkeW5hbWljSGVhZCIsImR5bmFtaWNCb2R5IiwiY29va2llcyIsInBhdGhQYXJ0cyIsImFyY2hLZXkiLCJzdGFydHNXaXRoIiwiYXJjaENsZWFuZWQiLCJzbGljZSIsImNhbGwiLCJzcGxpY2UiLCJhc3NpZ24iLCJwcmVmZXJyZWRBcmNoT3JkZXIiLCJodG1sQXR0cmlidXRlSG9va3MiLCJnZXRIdG1sQXR0cmlidXRlcyIsInJlcXVlc3QiLCJjb21iaW5lZEF0dHJpYnV0ZXMiLCJfIiwiZWFjaCIsImhvb2siLCJhdHRyaWJ1dGVzIiwiRXJyb3IiLCJleHRlbmQiLCJhZGRIdG1sQXR0cmlidXRlSG9vayIsInB1c2giLCJhcHBVcmwiLCJSb3V0ZVBvbGljeSIsImNsYXNzaWZ5IiwiTWV0ZW9yIiwic3RhcnR1cCIsImdldHRlciIsImtleSIsInByb2dyYW0iLCJ2YWx1ZSIsImNhbGN1bGF0ZUNsaWVudEhhc2giLCJjbGllbnRIYXNoIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaE5vblJlZnJlc2hhYmxlIiwiY2FsY3VsYXRlQ2xpZW50SGFzaFJlcGxhY2VhYmxlIiwiZ2V0UmVmcmVzaGFibGVBc3NldHMiLCJfdGltZW91dEFkanVzdG1lbnRSZXF1ZXN0Q2FsbGJhY2siLCJzZXRUaW1lb3V0IiwiZmluaXNoTGlzdGVuZXJzIiwibGlzdGVuZXJzIiwicmVtb3ZlQWxsTGlzdGVuZXJzIiwib24iLCJsIiwiYm9pbGVycGxhdGVCeUFyY2giLCJib2lsZXJwbGF0ZURhdGFDYWxsYmFja3MiLCJjcmVhdGUiLCJyZWdpc3RlckJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrIiwiY2FsbGJhY2siLCJwcmV2aW91c0NhbGxiYWNrIiwic3RyaWN0RXF1YWwiLCJnZXRCb2lsZXJwbGF0ZSIsImdldEJvaWxlcnBsYXRlQXN5bmMiLCJhd2FpdCIsImVuY29kZVJ1bnRpbWVDb25maWciLCJydGltZUNvbmZpZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmNvZGVVUklDb21wb25lbnQiLCJkZWNvZGVSdW50aW1lQ29uZmlnIiwicnRpbWVDb25maWdTdHIiLCJkZWNvZGVVUklDb21wb25lbnQiLCJydW50aW1lQ29uZmlnIiwiaG9va3MiLCJIb29rIiwidXBkYXRlSG9va3MiLCJpc1VwZGF0ZWRCeUFyY2giLCJhZGRSdW50aW1lQ29uZmlnSG9vayIsInJlZ2lzdGVyIiwiYm9pbGVycGxhdGUiLCJmb3JFYWNoIiwibWV0ZW9yUnVudGltZUNvbmZpZyIsImVuY29kZWRDdXJyZW50Q29uZmlnIiwiYmFzZURhdGEiLCJ1cGRhdGVkIiwiZGF0YSIsImh0bWxBdHRyaWJ1dGVzIiwicGljayIsIm1hZGVDaGFuZ2VzIiwicHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwia2V5cyIsInRoZW4iLCJyZXN1bHQiLCJzdHJlYW0iLCJ0b0hUTUxTdHJlYW0iLCJzdGF0dXNDb2RlIiwiYWRkVXBkYXRlZE5vdGlmeUhvb2siLCJoYW5kbGVyIiwiZ2VuZXJhdGVCb2lsZXJwbGF0ZUluc3RhbmNlIiwibWFuaWZlc3QiLCJhZGRpdGlvbmFsT3B0aW9ucyIsInJ1bnRpbWVDb25maWdPdmVycmlkZXMiLCJjYiIsIkJvaWxlcnBsYXRlIiwicGF0aE1hcHBlciIsIml0ZW1QYXRoIiwiYmFzZURhdGFFeHRlbnNpb24iLCJhZGRpdGlvbmFsU3RhdGljSnMiLCJtYXAiLCJtZXRlb3JSdW50aW1lSGFzaCIsInJvb3RVcmxQYXRoUHJlZml4Iiwic3JpTW9kZSIsImlubGluZVNjcmlwdHNBbGxvd2VkIiwiaW5saW5lIiwic3RhdGljRmlsZXNNaWRkbGV3YXJlIiwic3RhdGljRmlsZXNCeUFyY2giLCJuZXh0IiwiZSIsInNlcnZlU3RhdGljSnMiLCJzIiwibWV0aG9kIiwic2V0dGluZ3MiLCJwYWNrYWdlcyIsIndlYmFwcCIsImFsd2F5c1JldHVybkNvbnRlbnQiLCJ3cml0ZUhlYWQiLCJCdWZmZXIiLCJieXRlTGVuZ3RoIiwid3JpdGUiLCJlbmQiLCJzdGF0dXMiLCJBbGxvdyIsImhhcyIsInBhdXNlZCIsImluZm8iLCJnZXRTdGF0aWNGaWxlSW5mbyIsIm1heEFnZSIsImNhY2hlYWJsZSIsInNldEhlYWRlciIsInNvdXJjZU1hcFVybCIsInR5cGUiLCJjb250ZW50IiwiYWJzb2x1dGVQYXRoIiwibWF4YWdlIiwiZG90ZmlsZXMiLCJsYXN0TW9kaWZpZWQiLCJlcnIiLCJMb2ciLCJlcnJvciIsInBpcGUiLCJvcmlnaW5hbFBhdGgiLCJzdGF0aWNBcmNoTGlzdCIsImFyY2hJbmRleCIsImluZGV4T2YiLCJ1bnNoaWZ0Iiwic29tZSIsInN0YXRpY0ZpbGVzIiwiZmluYWxpemUiLCJwYXJzZVBvcnQiLCJwb3J0IiwicGFyc2VkUG9ydCIsInBhcnNlSW50IiwiTnVtYmVyIiwiaXNOYU4iLCJwYXVzZUNsaWVudCIsImdlbmVyYXRlQ2xpZW50UHJvZ3JhbSIsInJ1bldlYkFwcFNlcnZlciIsInNodXR0aW5nRG93biIsInN5bmNRdWV1ZSIsIl9TeW5jaHJvbm91c1F1ZXVlIiwiZ2V0SXRlbVBhdGhuYW1lIiwiaXRlbVVybCIsInJlbG9hZENsaWVudFByb2dyYW1zIiwicnVuVGFzayIsImNvbmZpZ0pzb24iLCJfX21ldGVvcl9ib290c3RyYXBfXyIsImNsaWVudEFyY2hzIiwiY2xpZW50UGF0aHMiLCJzdGFjayIsInByb2Nlc3MiLCJleGl0IiwidW5wYXVzZSIsImNsaWVudERpciIsInNlcnZlckRpciIsInByb2dyYW1Kc29uUGF0aCIsInByb2dyYW1Kc29uIiwiY29kZSIsImZvcm1hdCIsIml0ZW0iLCJ3aGVyZSIsInNvdXJjZU1hcCIsIlBVQkxJQ19TRVRUSU5HUyIsImNvbmZpZ092ZXJyaWRlcyIsIm9sZFByb2dyYW0iLCJuZXdQcm9ncmFtIiwiV2ViQXBwSGFzaGluZyIsInZlcnNpb25SZWZyZXNoYWJsZSIsInZlcnNpb25Ob25SZWZyZXNoYWJsZSIsInJlcGxhY2VhYmxlIiwidmVyc2lvblJlcGxhY2VhYmxlIiwiX3R5cGUiLCJjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zIiwiaG1yVmVyc2lvbiIsIm1hbmlmZXN0VXJsUHJlZml4IiwicmVwbGFjZSIsIm1hbmlmZXN0VXJsIiwiUGFja2FnZSIsImF1dG91cGRhdGUiLCJBVVRPVVBEQVRFX1ZFUlNJT04iLCJBdXRvdXBkYXRlIiwiYXV0b3VwZGF0ZVZlcnNpb24iLCJlbnYiLCJnZW5lcmF0ZUJvaWxlcnBsYXRlRm9yQXJjaCIsImRlZmF1bHRPcHRpb25zRm9yQXJjaCIsIkREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMIiwiTU9CSUxFX0REUF9VUkwiLCJhYnNvbHV0ZVVybCIsIlJPT1RfVVJMIiwiTU9CSUxFX1JPT1RfVVJMIiwiZ2VuZXJhdGVCb2lsZXJwbGF0ZSIsInJlZnJlc2hhYmxlQXNzZXRzIiwiY3NzIiwiZmlsZSIsImFwcCIsInJhd0Nvbm5lY3RIYW5kbGVycyIsInVzZSIsImlzVmFsaWRVcmwiLCJyZXNwb25zZSIsInF1ZXJ5IiwiZ2V0UGF0aFBhcnRzIiwic2hpZnQiLCJpc1ByZWZpeE9mIiwicHJlZml4IiwiYXJyYXkiLCJldmVyeSIsInBhcnQiLCJwYXRoUHJlZml4Iiwic2VhcmNoIiwicHJlZml4UGFydHMiLCJtZXRlb3JJbnRlcm5hbEhhbmRsZXJzIiwicGFja2FnZUFuZEFwcEhhbmRsZXJzIiwic3VwcHJlc3NDb25uZWN0RXJyb3JzIiwiaXNEZXZlbG9wbWVudCIsIm5ld0hlYWRlcnMiLCJjYXRjaCIsImh0dHBTZXJ2ZXIiLCJvbkxpc3RlbmluZ0NhbGxiYWNrcyIsInNvY2tldCIsImRlc3Ryb3llZCIsIm1lc3NhZ2UiLCJkZXN0cm95IiwiY29ubmVjdEhhbmRsZXJzIiwiY29ubmVjdEFwcCIsIm9uTGlzdGVuaW5nIiwiZiIsInN0YXJ0TGlzdGVuaW5nIiwibGlzdGVuT3B0aW9ucyIsImxpc3RlbiIsImV4cG9ydHMiLCJtYWluIiwiYXJndiIsInN0YXJ0SHR0cFNlcnZlciIsImJpbmRFbnZpcm9ubWVudCIsIk1FVEVPUl9QUklOVF9PTl9MSVNURU4iLCJjb25zb2xlIiwibG9nIiwiY2FsbGJhY2tzIiwibG9jYWxQb3J0IiwiUE9SVCIsInVuaXhTb2NrZXRQYXRoIiwiVU5JWF9TT0NLRVRfUEFUSCIsImlzV29ya2VyIiwid29ya2VyTmFtZSIsIndvcmtlciIsImlkIiwidW5peFNvY2tldFBlcm1pc3Npb25zIiwiVU5JWF9TT0NLRVRfUEVSTUlTU0lPTlMiLCJ0cmltIiwidGVzdCIsInVuaXhTb2NrZXRHcm91cCIsIlVOSVhfU09DS0VUX0dST1VQIiwidW5peFNvY2tldEdyb3VwSW5mbyIsInN5bmMiLCJncm91cCIsInVpZCIsImdpZCIsImhvc3QiLCJCSU5EX0lQIiwic2V0SW5saW5lU2NyaXB0c0FsbG93ZWQiLCJlbmFibGVTdWJyZXNvdXJjZUludGVncml0eSIsInVzZV9jcmVkZW50aWFscyIsInNldEJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rIiwiaG9va0ZuIiwic2V0QnVuZGxlZEpzQ3NzUHJlZml4Iiwic2VsZiIsImFkZFN0YXRpY0pzIiwibnBtQ29ubmVjdCIsImNvbm5lY3RBcmdzIiwiaGFuZGxlcnMiLCJhcHBseSIsIm9yaWdpbmFsVXNlIiwidXNlQXJncyIsIm9yaWdpbmFsTGVuZ3RoIiwiZW50cnkiLCJvcmlnaW5hbEhhbmRsZSIsImhhbmRsZSIsImFzeW5jQXBwbHkiLCJhcmd1bWVudHMiLCJzdGF0U3luYyIsInVubGlua1N5bmMiLCJleGlzdHNTeW5jIiwic29ja2V0UGF0aCIsImlzU29ja2V0IiwiZXZlbnRFbWl0dGVyIiwic2lnbmFsIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBQUEsSUFBSUEsYUFBYTtFQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyxzQ0FBc0MsRUFBQztJQUFDQyxPQUFPLENBQUNDLENBQUMsRUFBQztNQUFDSixhQUFhLEdBQUNJLENBQUM7SUFBQTtFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7RUFBdEdILE9BQU8sQ0FBQ0ksTUFBTSxDQUFDO0lBQUNDLE1BQU0sRUFBQyxNQUFJQSxNQUFNO0lBQUNDLGVBQWUsRUFBQyxNQUFJQTtFQUFlLENBQUMsQ0FBQztFQUFDLElBQUlDLE1BQU07RUFBQ1AsT0FBTyxDQUFDQyxJQUFJLENBQUMsUUFBUSxFQUFDO0lBQUNDLE9BQU8sQ0FBQ0MsQ0FBQyxFQUFDO01BQUNJLE1BQU0sR0FBQ0osQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlLLFlBQVksRUFBQ0MsU0FBUyxFQUFDQyxTQUFTO0VBQUNWLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDLElBQUksRUFBQztJQUFDTyxZQUFZLENBQUNMLENBQUMsRUFBQztNQUFDSyxZQUFZLEdBQUNMLENBQUM7SUFBQSxDQUFDO0lBQUNNLFNBQVMsQ0FBQ04sQ0FBQyxFQUFDO01BQUNNLFNBQVMsR0FBQ04sQ0FBQztJQUFBLENBQUM7SUFBQ08sU0FBUyxDQUFDUCxDQUFDLEVBQUM7TUFBQ08sU0FBUyxHQUFDUCxDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQUMsSUFBSVEsWUFBWTtFQUFDWCxPQUFPLENBQUNDLElBQUksQ0FBQyxNQUFNLEVBQUM7SUFBQ1UsWUFBWSxDQUFDUixDQUFDLEVBQUM7TUFBQ1EsWUFBWSxHQUFDUixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQUMsSUFBSVMsUUFBUTtFQUFDWixPQUFPLENBQUND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Q0csVUFBVSxDQUFDLENBQUNDLFFBQVEsRUFBRSxFQUFFO01BQ25DO01BQ0E7TUFDQUgsVUFBVSxDQUFDRSxVQUFVLENBQUM7SUFDeEIsQ0FBQyxNQUFNO01BQ0wsTUFBTSxJQUFJN1IsS0FBSyxDQUNiLDBDQUFrQzZSLFVBQVUseUJBQzVDLDhEQUE4RCxHQUM5RCwyQkFBMkIsQ0FDNUI7SUFDSDtFQUNGLENBQUMsQ0FBQyxPQUFPbkssS0FBSyxFQUFFO0lBQ2Q7SUFDQTtJQUNBO0lBQ0EsSUFBSUEsS0FBSyxDQUFDc0MsSUFBSSxLQUFLLFFBQVEsRUFBRTtNQUMzQixNQUFNdEMsS0FBSztJQUNiO0VBQ0Y7QUFDRixDQUFDO0FBS00sTUFBTXZNLHlCQUF5QixHQUNwQyxVQUFDMFcsVUFBVSxFQUE2QjtFQUFBLElBQTNCRSxZQUFZLHVFQUFHdEksT0FBTztFQUNqQyxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDckcsT0FBTyxDQUFDNE8sTUFBTSxJQUFJO0lBQ3hERCxZQUFZLENBQUN2USxFQUFFLENBQUN3USxNQUFNLEVBQUV6UixNQUFNLENBQUNxTyxlQUFlLENBQUMsTUFBTTtNQUNuRCxJQUFJZ0QsVUFBVSxDQUFDQyxVQUFVLENBQUMsRUFBRTtRQUMxQkYsVUFBVSxDQUFDRSxVQUFVLENBQUM7TUFDeEI7SUFDRixDQUFDLENBQUMsQ0FBQztFQUNMLENBQUMsQ0FBQztBQUNKLENBQUMsQyIsImZpbGUiOiIvcGFja2FnZXMvd2ViYXBwLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jLCBjaG1vZFN5bmMsIGNob3duU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGNyZWF0ZVNlcnZlciB9IGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgdXNlckluZm8gfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIGFzIHBhdGhKb2luLCBkaXJuYW1lIGFzIHBhdGhEaXJuYW1lIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCB9IGZyb20gJ3VybCc7XG5pbXBvcnQgeyBjcmVhdGVIYXNoIH0gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IGNvbm5lY3QgfSBmcm9tICcuL2Nvbm5lY3QuanMnO1xuaW1wb3J0IGNvbXByZXNzIGZyb20gJ2NvbXByZXNzaW9uJztcbmltcG9ydCBjb29raWVQYXJzZXIgZnJvbSAnY29va2llLXBhcnNlcic7XG5pbXBvcnQgcXMgZnJvbSAncXMnO1xuaW1wb3J0IHBhcnNlUmVxdWVzdCBmcm9tICdwYXJzZXVybCc7XG5pbXBvcnQgYmFzaWNBdXRoIGZyb20gJ2Jhc2ljLWF1dGgtY29ubmVjdCc7XG5pbXBvcnQgeyBsb29rdXAgYXMgbG9va3VwVXNlckFnZW50IH0gZnJvbSAndXNlcmFnZW50JztcbmltcG9ydCB7IGlzTW9kZXJuIH0gZnJvbSAnbWV0ZW9yL21vZGVybi1icm93c2Vycyc7XG5pbXBvcnQgc2VuZCBmcm9tICdzZW5kJztcbmltcG9ydCB7XG4gIHJlbW92ZUV4aXN0aW5nU29ja2V0RmlsZSxcbiAgcmVnaXN0ZXJTb2NrZXRGaWxlQ2xlYW51cCxcbn0gZnJvbSAnLi9zb2NrZXRfZmlsZS5qcyc7XG5pbXBvcnQgY2x1c3RlciBmcm9tICdjbHVzdGVyJztcbmltcG9ydCB3aG9tc3QgZnJvbSAnQHZsYXNreS93aG9tc3QnO1xuXG52YXIgU0hPUlRfU09DS0VUX1RJTUVPVVQgPSA1ICogMTAwMDtcbnZhciBMT05HX1NPQ0tFVF9USU1FT1VUID0gMTIwICogMTAwMDtcblxuZXhwb3J0IGNvbnN0IFdlYkFwcCA9IHt9O1xuZXhwb3J0IGNvbnN0IFdlYkFwcEludGVybmFscyA9IHt9O1xuXG5jb25zdCBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vLyBiYWNrd2FyZHMgY29tcGF0IHRvIDIuMCBvZiBjb25uZWN0XG5jb25uZWN0LmJhc2ljQXV0aCA9IGJhc2ljQXV0aDtcblxuV2ViQXBwSW50ZXJuYWxzLk5wbU1vZHVsZXMgPSB7XG4gIGNvbm5lY3Q6IHtcbiAgICB2ZXJzaW9uOiBOcG0ucmVxdWlyZSgnY29ubmVjdC9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuICAgIG1vZHVsZTogY29ubmVjdCxcbiAgfSxcbn07XG5cbi8vIFRob3VnaCB3ZSBtaWdodCBwcmVmZXIgdG8gdXNlIHdlYi5icm93c2VyIChtb2Rlcm4pIGFzIHRoZSBkZWZhdWx0XG4vLyBhcmNoaXRlY3R1cmUsIHNhZmV0eSByZXF1aXJlcyBhIG1vcmUgY29tcGF0aWJsZSBkZWZhdWx0QXJjaC5cbldlYkFwcC5kZWZhdWx0QXJjaCA9ICd3ZWIuYnJvd3Nlci5sZWdhY3knO1xuXG4vLyBYWFggbWFwcyBhcmNocyB0byBtYW5pZmVzdHNcbldlYkFwcC5jbGllbnRQcm9ncmFtcyA9IHt9O1xuXG4vLyBYWFggbWFwcyBhcmNocyB0byBwcm9ncmFtIHBhdGggb24gZmlsZXN5c3RlbVxudmFyIGFyY2hQYXRoID0ge307XG5cbnZhciBidW5kbGVkSnNDc3NVcmxSZXdyaXRlSG9vayA9IGZ1bmN0aW9uKHVybCkge1xuICB2YXIgYnVuZGxlZFByZWZpeCA9IF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uUk9PVF9VUkxfUEFUSF9QUkVGSVggfHwgJyc7XG4gIHJldHVybiBidW5kbGVkUHJlZml4ICsgdXJsO1xufTtcblxudmFyIHNoYTEgPSBmdW5jdGlvbihjb250ZW50cykge1xuICB2YXIgaGFzaCA9IGNyZWF0ZUhhc2goJ3NoYTEnKTtcbiAgaGFzaC51cGRhdGUoY29udGVudHMpO1xuICByZXR1cm4gaGFzaC5kaWdlc3QoJ2hleCcpO1xufTtcblxuZnVuY3Rpb24gc2hvdWxkQ29tcHJlc3MocmVxLCByZXMpIHtcbiAgaWYgKHJlcS5oZWFkZXJzWyd4LW5vLWNvbXByZXNzaW9uJ10pIHtcbiAgICAvLyBkb24ndCBjb21wcmVzcyByZXNwb25zZXMgd2l0aCB0aGlzIHJlcXVlc3QgaGVhZGVyXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gZmFsbGJhY2sgdG8gc3RhbmRhcmQgZmlsdGVyIGZ1bmN0aW9uXG4gIHJldHVybiBjb21wcmVzcy5maWx0ZXIocmVxLCByZXMpO1xufVxuXG4vLyAjQnJvd3NlcklkZW50aWZpY2F0aW9uXG4vL1xuLy8gV2UgaGF2ZSBtdWx0aXBsZSBwbGFjZXMgdGhhdCB3YW50IHRvIGlkZW50aWZ5IHRoZSBicm93c2VyOiB0aGVcbi8vIHVuc3VwcG9ydGVkIGJyb3dzZXIgcGFnZSwgdGhlIGFwcGNhY2hlIHBhY2thZ2UsIGFuZCwgZXZlbnR1YWxseVxuLy8gZGVsaXZlcmluZyBicm93c2VyIHBvbHlmaWxscyBvbmx5IGFzIG5lZWRlZC5cbi8vXG4vLyBUbyBhdm9pZCBkZXRlY3RpbmcgdGhlIGJyb3dzZXIgaW4gbXVsdGlwbGUgcGxhY2VzIGFkLWhvYywgd2UgY3JlYXRlIGFcbi8vIE1ldGVvciBcImJyb3dzZXJcIiBvYmplY3QuIEl0IHVzZXMgYnV0IGRvZXMgbm90IGV4cG9zZSB0aGUgbnBtXG4vLyB1c2VyYWdlbnQgbW9kdWxlICh3ZSBjb3VsZCBjaG9vc2UgYSBkaWZmZXJlbnQgbWVjaGFuaXNtIHRvIGlkZW50aWZ5XG4vLyB0aGUgYnJvd3NlciBpbiB0aGUgZnV0dXJlIGlmIHdlIHdhbnRlZCB0bykuICBUaGUgYnJvd3NlciBvYmplY3Rcbi8vIGNvbnRhaW5zXG4vL1xuLy8gKiBgbmFtZWA6IHRoZSBuYW1lIG9mIHRoZSBicm93c2VyIGluIGNhbWVsIGNhc2Vcbi8vICogYG1ham9yYCwgYG1pbm9yYCwgYHBhdGNoYDogaW50ZWdlcnMgZGVzY3JpYmluZyB0aGUgYnJvd3NlciB2ZXJzaW9uXG4vL1xuLy8gQWxzbyBoZXJlIGlzIGFuIGVhcmx5IHZlcnNpb24gb2YgYSBNZXRlb3IgYHJlcXVlc3RgIG9iamVjdCwgaW50ZW5kZWRcbi8vIHRvIGJlIGEgaGlnaC1sZXZlbCBkZXNjcmlwdGlvbiBvZiB0aGUgcmVxdWVzdCB3aXRob3V0IGV4cG9zaW5nXG4vLyBkZXRhaWxzIG9mIGNvbm5lY3QncyBsb3ctbGV2ZWwgYHJlcWAuICBDdXJyZW50bHkgaXQgY29udGFpbnM6XG4vL1xuLy8gKiBgYnJvd3NlcmA6IGJyb3dzZXIgaWRlbnRpZmljYXRpb24gb2JqZWN0IGRlc2NyaWJlZCBhYm92ZVxuLy8gKiBgdXJsYDogcGFyc2VkIHVybCwgaW5jbHVkaW5nIHBhcnNlZCBxdWVyeSBwYXJhbXNcbi8vXG4vLyBBcyBhIHRlbXBvcmFyeSBoYWNrIHRoZXJlIGlzIGEgYGNhdGVnb3JpemVSZXF1ZXN0YCBmdW5jdGlvbiBvbiBXZWJBcHAgd2hpY2hcbi8vIGNvbnZlcnRzIGEgY29ubmVjdCBgcmVxYCB0byBhIE1ldGVvciBgcmVxdWVzdGAuIFRoaXMgY2FuIGdvIGF3YXkgb25jZSBzbWFydFxuLy8gcGFja2FnZXMgc3VjaCBhcyBhcHBjYWNoZSBhcmUgYmVpbmcgcGFzc2VkIGEgYHJlcXVlc3RgIG9iamVjdCBkaXJlY3RseSB3aGVuXG4vLyB0aGV5IHNlcnZlIGNvbnRlbnQuXG4vL1xuLy8gVGhpcyBhbGxvd3MgYHJlcXVlc3RgIHRvIGJlIHVzZWQgdW5pZm9ybWx5OiBpdCBpcyBwYXNzZWQgdG8gdGhlIGh0bWxcbi8vIGF0dHJpYnV0ZXMgaG9vaywgYW5kIHRoZSBhcHBjYWNoZSBwYWNrYWdlIGNhbiB1c2UgaXQgd2hlbiBkZWNpZGluZ1xuLy8gd2hldGhlciB0byBnZW5lcmF0ZSBhIDQwNCBmb3IgdGhlIG1hbmlmZXN0LlxuLy9cbi8vIFJlYWwgcm91dGluZyAvIHNlcnZlciBzaWRlIHJlbmRlcmluZyB3aWxsIHByb2JhYmx5IHJlZmFjdG9yIHRoaXNcbi8vIGhlYXZpbHkuXG5cbi8vIGUuZy4gXCJNb2JpbGUgU2FmYXJpXCIgPT4gXCJtb2JpbGVTYWZhcmlcIlxudmFyIGNhbWVsQ2FzZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgdmFyIHBhcnRzID0gbmFtZS5zcGxpdCgnICcpO1xuICBwYXJ0c1swXSA9IHBhcnRzWzBdLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAodmFyIGkgPSAxOyBpIDwgcGFydHMubGVuZ3RoOyArK2kpIHtcbiAgICBwYXJ0c1tpXSA9IHBhcnRzW2ldLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcGFydHNbaV0uc3Vic3RyKDEpO1xuICB9XG4gIHJldHVybiBwYXJ0cy5qb2luKCcnKTtcbn07XG5cbnZhciBpZGVudGlmeUJyb3dzZXIgPSBmdW5jdGlvbih1c2VyQWdlbnRTdHJpbmcpIHtcbiAgdmFyIHVzZXJBZ2VudCA9IGxvb2t1cFVzZXJBZ2VudCh1c2VyQWdlbnRTdHJpbmcpO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IGNhbWVsQ2FzZSh1c2VyQWdlbnQuZmFtaWx5KSxcbiAgICBtYWpvcjogK3VzZXJBZ2VudC5tYWpvcixcbiAgICBtaW5vcjogK3VzZXJBZ2VudC5taW5vcixcbiAgICBwYXRjaDogK3VzZXJBZ2VudC5wYXRjaCxcbiAgfTtcbn07XG5cbi8vIFhYWCBSZWZhY3RvciBhcyBwYXJ0IG9mIGltcGxlbWVudGluZyByZWFsIHJvdXRpbmcuXG5XZWJBcHBJbnRlcm5hbHMuaWRlbnRpZnlCcm93c2VyID0gaWRlbnRpZnlCcm93c2VyO1xuXG5XZWJBcHAuY2F0ZWdvcml6ZVJlcXVlc3QgPSBmdW5jdGlvbihyZXEpIHtcbiAgaWYgKHJlcS5icm93c2VyICYmIHJlcS5hcmNoICYmIHR5cGVvZiByZXEubW9kZXJuID09PSAnYm9vbGVhbicpIHtcbiAgICAvLyBBbHJlYWR5IGNhdGVnb3JpemVkLlxuICAgIHJldHVybiByZXE7XG4gIH1cblxuICBjb25zdCBicm93c2VyID0gaWRlbnRpZnlCcm93c2VyKHJlcS5oZWFkZXJzWyd1c2VyLWFnZW50J10pO1xuICBjb25zdCBtb2Rlcm4gPSBpc01vZGVybihicm93c2VyKTtcbiAgY29uc3QgcGF0aCA9XG4gICAgdHlwZW9mIHJlcS5wYXRobmFtZSA9PT0gJ3N0cmluZydcbiAgICAgID8gcmVxLnBhdGhuYW1lXG4gICAgICA6IHBhcnNlUmVxdWVzdChyZXEpLnBhdGhuYW1lO1xuXG4gIGNvbnN0IGNhdGVnb3JpemVkID0ge1xuICAgIGJyb3dzZXIsXG4gICAgbW9kZXJuLFxuICAgIHBhdGgsXG4gICAgYXJjaDogV2ViQXBwLmRlZmF1bHRBcmNoLFxuICAgIHVybDogcGFyc2VVcmwocmVxLnVybCwgdHJ1ZSksXG4gICAgZHluYW1pY0hlYWQ6IHJlcS5keW5hbWljSGVhZCxcbiAgICBkeW5hbWljQm9keTogcmVxLmR5bmFtaWNCb2R5LFxuICAgIGhlYWRlcnM6IHJlcS5oZWFkZXJzLFxuICAgIGNvb2tpZXM6IHJlcS5jb29raWVzLFxuICB9O1xuXG4gIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGguc3BsaXQoJy8nKTtcbiAgY29uc3QgYXJjaEtleSA9IHBhdGhQYXJ0c1sxXTtcblxuICBpZiAoYXJjaEtleS5zdGFydHNXaXRoKCdfXycpKSB7XG4gICAgY29uc3QgYXJjaENsZWFuZWQgPSAnd2ViLicgKyBhcmNoS2V5LnNsaWNlKDIpO1xuICAgIGlmIChoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2hDbGVhbmVkKSkge1xuICAgICAgcGF0aFBhcnRzLnNwbGljZSgxLCAxKTsgLy8gUmVtb3ZlIHRoZSBhcmNoS2V5IHBhcnQuXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihjYXRlZ29yaXplZCwge1xuICAgICAgICBhcmNoOiBhcmNoQ2xlYW5lZCxcbiAgICAgICAgcGF0aDogcGF0aFBhcnRzLmpvaW4oJy8nKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRPRE8gUGVyaGFwcyBvbmUgZGF5IHdlIGNvdWxkIGluZmVyIENvcmRvdmEgY2xpZW50cyBoZXJlLCBzbyB0aGF0IHdlXG4gIC8vIHdvdWxkbid0IGhhdmUgdG8gdXNlIHByZWZpeGVkIFwiL19fY29yZG92YS8uLi5cIiBVUkxzLlxuICBjb25zdCBwcmVmZXJyZWRBcmNoT3JkZXIgPSBpc01vZGVybihicm93c2VyKVxuICAgID8gWyd3ZWIuYnJvd3NlcicsICd3ZWIuYnJvd3Nlci5sZWdhY3knXVxuICAgIDogWyd3ZWIuYnJvd3Nlci5sZWdhY3knLCAnd2ViLmJyb3dzZXInXTtcblxuICBmb3IgKGNvbnN0IGFyY2ggb2YgcHJlZmVycmVkQXJjaE9yZGVyKSB7XG4gICAgLy8gSWYgb3VyIHByZWZlcnJlZCBhcmNoIGlzIG5vdCBhdmFpbGFibGUsIGl0J3MgYmV0dGVyIHRvIHVzZSBhbm90aGVyXG4gICAgLy8gY2xpZW50IGFyY2ggdGhhdCBpcyBhdmFpbGFibGUgdGhhbiB0byBndWFyYW50ZWUgdGhlIHNpdGUgd29uJ3Qgd29ya1xuICAgIC8vIGJ5IHJldHVybmluZyBhbiB1bmtub3duIGFyY2guIEZvciBleGFtcGxlLCBpZiB3ZWIuYnJvd3Nlci5sZWdhY3kgaXNcbiAgICAvLyBleGNsdWRlZCB1c2luZyB0aGUgLS1leGNsdWRlLWFyY2hzIGNvbW1hbmQtbGluZSBvcHRpb24sIGxlZ2FjeVxuICAgIC8vIGNsaWVudHMgYXJlIGJldHRlciBvZmYgcmVjZWl2aW5nIHdlYi5icm93c2VyICh3aGljaCBtaWdodCBhY3R1YWxseVxuICAgIC8vIHdvcmspIHRoYW4gcmVjZWl2aW5nIGFuIEhUVFAgNDA0IHJlc3BvbnNlLiBJZiBub25lIG9mIHRoZSBhcmNocyBpblxuICAgIC8vIHByZWZlcnJlZEFyY2hPcmRlciBhcmUgZGVmaW5lZCwgb25seSB0aGVuIHNob3VsZCB3ZSBzZW5kIGEgNDA0LlxuICAgIGlmIChoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2gpKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihjYXRlZ29yaXplZCwgeyBhcmNoIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjYXRlZ29yaXplZDtcbn07XG5cbi8vIEhUTUwgYXR0cmlidXRlIGhvb2tzOiBmdW5jdGlvbnMgdG8gYmUgY2FsbGVkIHRvIGRldGVybWluZSBhbnkgYXR0cmlidXRlcyB0b1xuLy8gYmUgYWRkZWQgdG8gdGhlICc8aHRtbD4nIHRhZy4gRWFjaCBmdW5jdGlvbiBpcyBwYXNzZWQgYSAncmVxdWVzdCcgb2JqZWN0IChzZWVcbi8vICNCcm93c2VySWRlbnRpZmljYXRpb24pIGFuZCBzaG91bGQgcmV0dXJuIG51bGwgb3Igb2JqZWN0LlxudmFyIGh0bWxBdHRyaWJ1dGVIb29rcyA9IFtdO1xudmFyIGdldEh0bWxBdHRyaWJ1dGVzID0gZnVuY3Rpb24ocmVxdWVzdCkge1xuICB2YXIgY29tYmluZWRBdHRyaWJ1dGVzID0ge307XG4gIF8uZWFjaChodG1sQXR0cmlidXRlSG9va3MgfHwgW10sIGZ1bmN0aW9uKGhvb2spIHtcbiAgICB2YXIgYXR0cmlidXRlcyA9IGhvb2socmVxdWVzdCk7XG4gICAgaWYgKGF0dHJpYnV0ZXMgPT09IG51bGwpIHJldHVybjtcbiAgICBpZiAodHlwZW9mIGF0dHJpYnV0ZXMgIT09ICdvYmplY3QnKVxuICAgICAgdGhyb3cgRXJyb3IoJ0hUTUwgYXR0cmlidXRlIGhvb2sgbXVzdCByZXR1cm4gbnVsbCBvciBvYmplY3QnKTtcbiAgICBfLmV4dGVuZChjb21iaW5lZEF0dHJpYnV0ZXMsIGF0dHJpYnV0ZXMpO1xuICB9KTtcbiAgcmV0dXJuIGNvbWJpbmVkQXR0cmlidXRlcztcbn07XG5XZWJBcHAuYWRkSHRtbEF0dHJpYnV0ZUhvb2sgPSBmdW5jdGlvbihob29rKSB7XG4gIGh0bWxBdHRyaWJ1dGVIb29rcy5wdXNoKGhvb2spO1xufTtcblxuLy8gU2VydmUgYXBwIEhUTUwgZm9yIHRoaXMgVVJMP1xudmFyIGFwcFVybCA9IGZ1bmN0aW9uKHVybCkge1xuICBpZiAodXJsID09PSAnL2Zhdmljb24uaWNvJyB8fCB1cmwgPT09ICcvcm9ib3RzLnR4dCcpIHJldHVybiBmYWxzZTtcblxuICAvLyBOT1RFOiBhcHAubWFuaWZlc3QgaXMgbm90IGEgd2ViIHN0YW5kYXJkIGxpa2UgZmF2aWNvbi5pY28gYW5kXG4gIC8vIHJvYm90cy50eHQuIEl0IGlzIGEgZmlsZSBuYW1lIHdlIGhhdmUgY2hvc2VuIHRvIHVzZSBmb3IgSFRNTDVcbiAgLy8gYXBwY2FjaGUgVVJMcy4gSXQgaXMgaW5jbHVkZWQgaGVyZSB0byBwcmV2ZW50IHVzaW5nIGFuIGFwcGNhY2hlXG4gIC8vIHRoZW4gcmVtb3ZpbmcgaXQgZnJvbSBwb2lzb25pbmcgYW4gYXBwIHBlcm1hbmVudGx5LiBFdmVudHVhbGx5LFxuICAvLyBvbmNlIHdlIGhhdmUgc2VydmVyIHNpZGUgcm91dGluZywgdGhpcyB3b24ndCBiZSBuZWVkZWQgYXNcbiAgLy8gdW5rbm93biBVUkxzIHdpdGggcmV0dXJuIGEgNDA0IGF1dG9tYXRpY2FsbHkuXG4gIGlmICh1cmwgPT09ICcvYXBwLm1hbmlmZXN0JykgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIEF2b2lkIHNlcnZpbmcgYXBwIEhUTUwgZm9yIGRlY2xhcmVkIHJvdXRlcyBzdWNoIGFzIC9zb2NranMvLlxuICBpZiAoUm91dGVQb2xpY3kuY2xhc3NpZnkodXJsKSkgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIHdlIGN1cnJlbnRseSByZXR1cm4gYXBwIEhUTUwgb24gYWxsIFVSTHMgYnkgZGVmYXVsdFxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIFdlIG5lZWQgdG8gY2FsY3VsYXRlIHRoZSBjbGllbnQgaGFzaCBhZnRlciBhbGwgcGFja2FnZXMgaGF2ZSBsb2FkZWRcbi8vIHRvIGdpdmUgdGhlbSBhIGNoYW5jZSB0byBwb3B1bGF0ZSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlxuLy9cbi8vIENhbGN1bGF0aW5nIHRoZSBoYXNoIGR1cmluZyBzdGFydHVwIG1lYW5zIHRoYXQgcGFja2FnZXMgY2FuIG9ubHlcbi8vIHBvcHVsYXRlIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18gZHVyaW5nIGxvYWQsIG5vdCBkdXJpbmcgc3RhcnR1cC5cbi8vXG4vLyBDYWxjdWxhdGluZyBpbnN0ZWFkIGl0IGF0IHRoZSBiZWdpbm5pbmcgb2YgbWFpbiBhZnRlciBhbGwgc3RhcnR1cFxuLy8gaG9va3MgaGFkIHJ1biB3b3VsZCBhbGxvdyBwYWNrYWdlcyB0byBhbHNvIHBvcHVsYXRlXG4vLyBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fIGR1cmluZyBzdGFydHVwLCBidXQgdGhhdCdzIHRvbyBsYXRlIGZvclxuLy8gYXV0b3VwZGF0ZSBiZWNhdXNlIGl0IG5lZWRzIHRvIGhhdmUgdGhlIGNsaWVudCBoYXNoIGF0IHN0YXJ0dXAgdG9cbi8vIGluc2VydCB0aGUgYXV0byB1cGRhdGUgdmVyc2lvbiBpdHNlbGYgaW50b1xuLy8gX19tZXRlb3JfcnVudGltZV9jb25maWdfXyB0byBnZXQgaXQgdG8gdGhlIGNsaWVudC5cbi8vXG4vLyBBbiBhbHRlcm5hdGl2ZSB3b3VsZCBiZSB0byBnaXZlIGF1dG91cGRhdGUgYSBcInBvc3Qtc3RhcnQsXG4vLyBwcmUtbGlzdGVuXCIgaG9vayB0byBhbGxvdyBpdCB0byBpbnNlcnQgdGhlIGF1dG8gdXBkYXRlIHZlcnNpb24gYXRcbi8vIHRoZSByaWdodCBtb21lbnQuXG5cbk1ldGVvci5zdGFydHVwKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBnZXR0ZXIoa2V5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFyY2gpIHtcbiAgICAgIGFyY2ggPSBhcmNoIHx8IFdlYkFwcC5kZWZhdWx0QXJjaDtcbiAgICAgIGNvbnN0IHByb2dyYW0gPSBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF07XG4gICAgICBjb25zdCB2YWx1ZSA9IHByb2dyYW0gJiYgcHJvZ3JhbVtrZXldO1xuICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgdGltZSB3ZSBoYXZlIGNhbGN1bGF0ZWQgdGhpcyBoYXNoLFxuICAgICAgLy8gcHJvZ3JhbVtrZXldIHdpbGwgYmUgYSB0aHVuayAobGF6eSBmdW5jdGlvbiB3aXRoIG5vIHBhcmFtZXRlcnMpXG4gICAgICAvLyB0aGF0IHdlIHNob3VsZCBjYWxsIHRvIGRvIHRoZSBhY3R1YWwgY29tcHV0YXRpb24uXG4gICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nID8gKHByb2dyYW1ba2V5XSA9IHZhbHVlKCkpIDogdmFsdWU7XG4gICAgfTtcbiAgfVxuXG4gIFdlYkFwcC5jYWxjdWxhdGVDbGllbnRIYXNoID0gV2ViQXBwLmNsaWVudEhhc2ggPSBnZXR0ZXIoJ3ZlcnNpb24nKTtcbiAgV2ViQXBwLmNhbGN1bGF0ZUNsaWVudEhhc2hSZWZyZXNoYWJsZSA9IGdldHRlcigndmVyc2lvblJlZnJlc2hhYmxlJyk7XG4gIFdlYkFwcC5jYWxjdWxhdGVDbGllbnRIYXNoTm9uUmVmcmVzaGFibGUgPSBnZXR0ZXIoJ3ZlcnNpb25Ob25SZWZyZXNoYWJsZScpO1xuICBXZWJBcHAuY2FsY3VsYXRlQ2xpZW50SGFzaFJlcGxhY2VhYmxlID0gZ2V0dGVyKCd2ZXJzaW9uUmVwbGFjZWFibGUnKTtcbiAgV2ViQXBwLmdldFJlZnJlc2hhYmxlQXNzZXRzID0gZ2V0dGVyKCdyZWZyZXNoYWJsZUFzc2V0cycpO1xufSk7XG5cbi8vIFdoZW4gd2UgaGF2ZSBhIHJlcXVlc3QgcGVuZGluZywgd2Ugd2FudCB0aGUgc29ja2V0IHRpbWVvdXQgdG8gYmUgbG9uZywgdG9cbi8vIGdpdmUgb3Vyc2VsdmVzIGEgd2hpbGUgdG8gc2VydmUgaXQsIGFuZCB0byBhbGxvdyBzb2NranMgbG9uZyBwb2xscyB0b1xuLy8gY29tcGxldGUuICBPbiB0aGUgb3RoZXIgaGFuZCwgd2Ugd2FudCB0byBjbG9zZSBpZGxlIHNvY2tldHMgcmVsYXRpdmVseVxuLy8gcXVpY2tseSwgc28gdGhhdCB3ZSBjYW4gc2h1dCBkb3duIHJlbGF0aXZlbHkgcHJvbXB0bHkgYnV0IGNsZWFubHksIHdpdGhvdXRcbi8vIGN1dHRpbmcgb2ZmIGFueW9uZSdzIHJlc3BvbnNlLlxuV2ViQXBwLl90aW1lb3V0QWRqdXN0bWVudFJlcXVlc3RDYWxsYmFjayA9IGZ1bmN0aW9uKHJlcSwgcmVzKSB7XG4gIC8vIHRoaXMgaXMgcmVhbGx5IGp1c3QgcmVxLnNvY2tldC5zZXRUaW1lb3V0KExPTkdfU09DS0VUX1RJTUVPVVQpO1xuICByZXEuc2V0VGltZW91dChMT05HX1NPQ0tFVF9USU1FT1VUKTtcbiAgLy8gSW5zZXJ0IG91ciBuZXcgZmluaXNoIGxpc3RlbmVyIHRvIHJ1biBCRUZPUkUgdGhlIGV4aXN0aW5nIG9uZSB3aGljaCByZW1vdmVzXG4gIC8vIHRoZSByZXNwb25zZSBmcm9tIHRoZSBzb2NrZXQuXG4gIHZhciBmaW5pc2hMaXN0ZW5lcnMgPSByZXMubGlzdGVuZXJzKCdmaW5pc2gnKTtcbiAgLy8gWFhYIEFwcGFyZW50bHkgaW4gTm9kZSAwLjEyIHRoaXMgZXZlbnQgd2FzIGNhbGxlZCAncHJlZmluaXNoJy5cbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2NvbW1pdC83YzliNjA3MFxuICAvLyBCdXQgaXQgaGFzIHN3aXRjaGVkIGJhY2sgdG8gJ2ZpbmlzaCcgaW4gTm9kZSB2NDpcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvMTQxMVxuICByZXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdmaW5pc2gnKTtcbiAgcmVzLm9uKCdmaW5pc2gnLCBmdW5jdGlvbigpIHtcbiAgICByZXMuc2V0VGltZW91dChTSE9SVF9TT0NLRVRfVElNRU9VVCk7XG4gIH0pO1xuICBfLmVhY2goZmluaXNoTGlzdGVuZXJzLCBmdW5jdGlvbihsKSB7XG4gICAgcmVzLm9uKCdmaW5pc2gnLCBsKTtcbiAgfSk7XG59O1xuXG4vLyBXaWxsIGJlIHVwZGF0ZWQgYnkgbWFpbiBiZWZvcmUgd2UgbGlzdGVuLlxuLy8gTWFwIGZyb20gY2xpZW50IGFyY2ggdG8gYm9pbGVycGxhdGUgb2JqZWN0LlxuLy8gQm9pbGVycGxhdGUgb2JqZWN0IGhhczpcbi8vICAgLSBmdW5jOiBYWFhcbi8vICAgLSBiYXNlRGF0YTogWFhYXG52YXIgYm9pbGVycGxhdGVCeUFyY2ggPSB7fTtcblxuLy8gUmVnaXN0ZXIgYSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IGNhbiBzZWxlY3RpdmVseSBtb2RpZnkgYm9pbGVycGxhdGVcbi8vIGRhdGEgZ2l2ZW4gYXJndW1lbnRzIChyZXF1ZXN0LCBkYXRhLCBhcmNoKS4gVGhlIGtleSBzaG91bGQgYmUgYSB1bmlxdWVcbi8vIGlkZW50aWZpZXIsIHRvIHByZXZlbnQgYWNjdW11bGF0aW5nIGR1cGxpY2F0ZSBjYWxsYmFja3MgZnJvbSB0aGUgc2FtZVxuLy8gY2FsbCBzaXRlIG92ZXIgdGltZS4gQ2FsbGJhY2tzIHdpbGwgYmUgY2FsbGVkIGluIHRoZSBvcmRlciB0aGV5IHdlcmVcbi8vIHJlZ2lzdGVyZWQuIEEgY2FsbGJhY2sgc2hvdWxkIHJldHVybiBmYWxzZSBpZiBpdCBkaWQgbm90IG1ha2UgYW55XG4vLyBjaGFuZ2VzIGFmZmVjdGluZyB0aGUgYm9pbGVycGxhdGUuIFBhc3NpbmcgbnVsbCBkZWxldGVzIHRoZSBjYWxsYmFjay5cbi8vIEFueSBwcmV2aW91cyBjYWxsYmFjayByZWdpc3RlcmVkIGZvciB0aGlzIGtleSB3aWxsIGJlIHJldHVybmVkLlxuY29uc3QgYm9pbGVycGxhdGVEYXRhQ2FsbGJhY2tzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbldlYkFwcEludGVybmFscy5yZWdpc3RlckJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrID0gZnVuY3Rpb24oa2V5LCBjYWxsYmFjaykge1xuICBjb25zdCBwcmV2aW91c0NhbGxiYWNrID0gYm9pbGVycGxhdGVEYXRhQ2FsbGJhY2tzW2tleV07XG5cbiAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrc1trZXldID0gY2FsbGJhY2s7XG4gIH0gZWxzZSB7XG4gICAgYXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxiYWNrLCBudWxsKTtcbiAgICBkZWxldGUgYm9pbGVycGxhdGVEYXRhQ2FsbGJhY2tzW2tleV07XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIHByZXZpb3VzIGNhbGxiYWNrIGluIGNhc2UgdGhlIG5ldyBjYWxsYmFjayBuZWVkcyB0byBjYWxsXG4gIC8vIGl0OyBmb3IgZXhhbXBsZSwgd2hlbiB0aGUgbmV3IGNhbGxiYWNrIGlzIGEgd3JhcHBlciBmb3IgdGhlIG9sZC5cbiAgcmV0dXJuIHByZXZpb3VzQ2FsbGJhY2sgfHwgbnVsbDtcbn07XG5cbi8vIEdpdmVuIGEgcmVxdWVzdCAoYXMgcmV0dXJuZWQgZnJvbSBgY2F0ZWdvcml6ZVJlcXVlc3RgKSwgcmV0dXJuIHRoZVxuLy8gYm9pbGVycGxhdGUgSFRNTCB0byBzZXJ2ZSBmb3IgdGhhdCByZXF1ZXN0LlxuLy9cbi8vIElmIGEgcHJldmlvdXMgY29ubmVjdCBtaWRkbGV3YXJlIGhhcyByZW5kZXJlZCBjb250ZW50IGZvciB0aGUgaGVhZCBvciBib2R5LFxuLy8gcmV0dXJucyB0aGUgYm9pbGVycGxhdGUgd2l0aCB0aGF0IGNvbnRlbnQgcGF0Y2hlZCBpbiBvdGhlcndpc2Vcbi8vIG1lbW9pemVzIG9uIEhUTUwgYXR0cmlidXRlcyAodXNlZCBieSwgZWcsIGFwcGNhY2hlKSBhbmQgd2hldGhlciBpbmxpbmVcbi8vIHNjcmlwdHMgYXJlIGN1cnJlbnRseSBhbGxvd2VkLlxuLy8gWFhYIHNvIGZhciB0aGlzIGZ1bmN0aW9uIGlzIGFsd2F5cyBjYWxsZWQgd2l0aCBhcmNoID09PSAnd2ViLmJyb3dzZXInXG5mdW5jdGlvbiBnZXRCb2lsZXJwbGF0ZShyZXF1ZXN0LCBhcmNoKSB7XG4gIHJldHVybiBnZXRCb2lsZXJwbGF0ZUFzeW5jKHJlcXVlc3QsIGFyY2gpLmF3YWl0KCk7XG59XG5cbi8qKlxuICogQHN1bW1hcnkgVGFrZXMgYSBydW50aW1lIGNvbmZpZ3VyYXRpb24gb2JqZWN0IGFuZFxuICogcmV0dXJucyBhbiBlbmNvZGVkIHJ1bnRpbWUgc3RyaW5nLlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHtPYmplY3R9IHJ0aW1lQ29uZmlnXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5XZWJBcHAuZW5jb2RlUnVudGltZUNvbmZpZyA9IGZ1bmN0aW9uKHJ0aW1lQ29uZmlnKSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkocnRpbWVDb25maWcpKSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRha2VzIGFuIGVuY29kZWQgcnVudGltZSBzdHJpbmcgYW5kIHJldHVybnNcbiAqIGEgcnVudGltZSBjb25maWd1cmF0aW9uIG9iamVjdC5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBydGltZUNvbmZpZ1N0cmluZ1xuICogQHJldHVybnMge09iamVjdH1cbiAqL1xuV2ViQXBwLmRlY29kZVJ1bnRpbWVDb25maWcgPSBmdW5jdGlvbihydGltZUNvbmZpZ1N0cikge1xuICByZXR1cm4gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQoSlNPTi5wYXJzZShydGltZUNvbmZpZ1N0cikpKTtcbn07XG5cbmNvbnN0IHJ1bnRpbWVDb25maWcgPSB7XG4gIC8vIGhvb2tzIHdpbGwgY29udGFpbiB0aGUgY2FsbGJhY2sgZnVuY3Rpb25zXG4gIC8vIHNldCBieSB0aGUgY2FsbGVyIHRvIGFkZFJ1bnRpbWVDb25maWdIb29rXG4gIGhvb2tzOiBuZXcgSG9vaygpLFxuICAvLyB1cGRhdGVIb29rcyB3aWxsIGNvbnRhaW4gdGhlIGNhbGxiYWNrIGZ1bmN0aW9uc1xuICAvLyBzZXQgYnkgdGhlIGNhbGxlciB0byBhZGRVcGRhdGVkTm90aWZ5SG9va1xuICB1cGRhdGVIb29rczogbmV3IEhvb2soKSxcbiAgLy8gaXNVcGRhdGVkQnlBcmNoIGlzIGFuIG9iamVjdCBjb250YWluaW5nIGZpZWxkcyBmb3IgZWFjaCBhcmNoXG4gIC8vIHRoYXQgdGhpcyBzZXJ2ZXIgc3VwcG9ydHMuXG4gIC8vIC0gRWFjaCBmaWVsZCB3aWxsIGJlIHRydWUgd2hlbiB0aGUgc2VydmVyIHVwZGF0ZXMgdGhlIHJ1bnRpbWVDb25maWcgZm9yIHRoYXQgYXJjaC5cbiAgLy8gLSBXaGVuIHRoZSBob29rIGNhbGxiYWNrIGlzIGNhbGxlZCB0aGUgdXBkYXRlIGZpZWxkIGluIHRoZSBjYWxsYmFjayBvYmplY3Qgd2lsbCBiZVxuICAvLyBzZXQgdG8gaXNVcGRhdGVkQnlBcmNoW2FyY2hdLlxuICAvLyA9IGlzVXBkYXRlZHlCeUFyY2hbYXJjaF0gaXMgcmVzZXQgdG8gZmFsc2UgYWZ0ZXIgdGhlIGNhbGxiYWNrLlxuICAvLyBUaGlzIGVuYWJsZXMgdGhlIGNhbGxlciB0byBjYWNoZSBkYXRhIGVmZmljaWVudGx5IHNvIHRoZXkgZG8gbm90IG5lZWQgdG9cbiAgLy8gZGVjb2RlICYgdXBkYXRlIGRhdGEgb24gZXZlcnkgY2FsbGJhY2sgd2hlbiB0aGUgcnVudGltZUNvbmZpZyBpcyBub3QgY2hhbmdpbmcuXG4gIGlzVXBkYXRlZEJ5QXJjaDoge30sXG59O1xuXG4vKipcbiAqIEBuYW1lIGFkZFJ1bnRpbWVDb25maWdIb29rQ2FsbGJhY2sob3B0aW9ucylcbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBpc3Byb3RvdHlwZSB0cnVlXG4gKiBAc3VtbWFyeSBDYWxsYmFjayBmb3IgYGFkZFJ1bnRpbWVDb25maWdIb29rYC5cbiAqXG4gKiBJZiB0aGUgaGFuZGxlciByZXR1cm5zIGEgX2ZhbHN5XyB2YWx1ZSB0aGUgaG9vayB3aWxsIG5vdFxuICogbW9kaWZ5IHRoZSBydW50aW1lIGNvbmZpZ3VyYXRpb24uXG4gKlxuICogSWYgdGhlIGhhbmRsZXIgcmV0dXJucyBhIF9TdHJpbmdfIHRoZSBob29rIHdpbGwgc3Vic3RpdHV0ZVxuICogdGhlIHN0cmluZyBmb3IgdGhlIGVuY29kZWQgY29uZmlndXJhdGlvbiBzdHJpbmcuXG4gKlxuICogKipXYXJuaW5nOioqIHRoZSBob29rIGRvZXMgbm90IGNoZWNrIHRoZSByZXR1cm4gdmFsdWUgYXQgYWxsIGl0IGlzXG4gKiB0aGUgcmVzcG9uc2liaWxpdHkgb2YgdGhlIGNhbGxlciB0byBnZXQgdGhlIGZvcm1hdHRpbmcgY29ycmVjdCB1c2luZ1xuICogdGhlIGhlbHBlciBmdW5jdGlvbnMuXG4gKlxuICogYGFkZFJ1bnRpbWVDb25maWdIb29rQ2FsbGJhY2tgIHRha2VzIG9ubHkgb25lIGBPYmplY3RgIGFyZ3VtZW50XG4gKiB3aXRoIHRoZSBmb2xsb3dpbmcgZmllbGRzOlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLmFyY2ggVGhlIGFyY2hpdGVjdHVyZSBvZiB0aGUgY2xpZW50XG4gKiByZXF1ZXN0aW5nIGEgbmV3IHJ1bnRpbWUgY29uZmlndXJhdGlvbi4gVGhpcyBjYW4gYmUgb25lIG9mXG4gKiBgd2ViLmJyb3dzZXJgLCBgd2ViLmJyb3dzZXIubGVnYWN5YCBvciBgd2ViLmNvcmRvdmFgLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMucmVxdWVzdFxuICogQSBOb2RlSnMgW0luY29taW5nTWVzc2FnZV0oaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9odHRwLmh0bWwjaHR0cF9jbGFzc19odHRwX2luY29taW5nbWVzc2FnZSlcbiAqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvaHR0cC5odG1sI2h0dHBfY2xhc3NfaHR0cF9pbmNvbWluZ21lc3NhZ2VcbiAqIGBPYmplY3RgIHRoYXQgY2FuIGJlIHVzZWQgdG8gZ2V0IGluZm9ybWF0aW9uIGFib3V0IHRoZSBpbmNvbWluZyByZXF1ZXN0LlxuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMuZW5jb2RlZEN1cnJlbnRDb25maWcgVGhlIGN1cnJlbnQgY29uZmlndXJhdGlvbiBvYmplY3RcbiAqIGVuY29kZWQgYXMgYSBzdHJpbmcgZm9yIGluY2x1c2lvbiBpbiB0aGUgcm9vdCBodG1sLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnVwZGF0ZWQgYHRydWVgIGlmIHRoZSBjb25maWcgZm9yIHRoaXMgYXJjaGl0ZWN0dXJlXG4gKiBoYXMgYmVlbiB1cGRhdGVkIHNpbmNlIGxhc3QgY2FsbGVkLCBvdGhlcndpc2UgYGZhbHNlYC4gVGhpcyBmbGFnIGNhbiBiZSB1c2VkXG4gKiB0byBjYWNoZSB0aGUgZGVjb2RpbmcvZW5jb2RpbmcgZm9yIGVhY2ggYXJjaGl0ZWN0dXJlLlxuICovXG5cbi8qKlxuICogQHN1bW1hcnkgSG9vayB0aGF0IGNhbGxzIGJhY2sgd2hlbiB0aGUgbWV0ZW9yIHJ1bnRpbWUgY29uZmlndXJhdGlvbixcbiAqIGBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fYCBpcyBiZWluZyBzZW50IHRvIGFueSBjbGllbnQuXG4gKlxuICogKipyZXR1cm5zKio6IDxzbWFsbD5fT2JqZWN0Xzwvc21hbGw+IGB7IHN0b3A6IGZ1bmN0aW9uLCBjYWxsYmFjazogZnVuY3Rpb24gfWBcbiAqIC0gYHN0b3BgIDxzbWFsbD5fRnVuY3Rpb25fPC9zbWFsbD4gQ2FsbCBgc3RvcCgpYCB0byBzdG9wIGdldHRpbmcgY2FsbGJhY2tzLlxuICogLSBgY2FsbGJhY2tgIDxzbWFsbD5fRnVuY3Rpb25fPC9zbWFsbD4gVGhlIHBhc3NlZCBpbiBgY2FsbGJhY2tgLlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHthZGRSdW50aW1lQ29uZmlnSG9va0NhbGxiYWNrfSBjYWxsYmFja1xuICogU2VlIGBhZGRSdW50aW1lQ29uZmlnSG9va0NhbGxiYWNrYCBkZXNjcmlwdGlvbi5cbiAqIEByZXR1cm5zIHtPYmplY3R9IHt7IHN0b3A6IGZ1bmN0aW9uLCBjYWxsYmFjazogZnVuY3Rpb24gfX1cbiAqIENhbGwgdGhlIHJldHVybmVkIGBzdG9wKClgIHRvIHN0b3AgZ2V0dGluZyBjYWxsYmFja3MuXG4gKiBUaGUgcGFzc2VkIGluIGBjYWxsYmFja2AgaXMgcmV0dXJuZWQgYWxzby5cbiAqL1xuV2ViQXBwLmFkZFJ1bnRpbWVDb25maWdIb29rID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgcmV0dXJuIHJ1bnRpbWVDb25maWcuaG9va3MucmVnaXN0ZXIoY2FsbGJhY2spO1xufTtcblxuZnVuY3Rpb24gZ2V0Qm9pbGVycGxhdGVBc3luYyhyZXF1ZXN0LCBhcmNoKSB7XG4gIGxldCBib2lsZXJwbGF0ZSA9IGJvaWxlcnBsYXRlQnlBcmNoW2FyY2hdO1xuICBydW50aW1lQ29uZmlnLmhvb2tzLmZvckVhY2goaG9vayA9PiB7XG4gICAgY29uc3QgbWV0ZW9yUnVudGltZUNvbmZpZyA9IGhvb2soe1xuICAgICAgYXJjaCxcbiAgICAgIHJlcXVlc3QsXG4gICAgICBlbmNvZGVkQ3VycmVudENvbmZpZzogYm9pbGVycGxhdGUuYmFzZURhdGEubWV0ZW9yUnVudGltZUNvbmZpZyxcbiAgICAgIHVwZGF0ZWQ6IHJ1bnRpbWVDb25maWcuaXNVcGRhdGVkQnlBcmNoW2FyY2hdLFxuICAgIH0pO1xuICAgIGlmICghbWV0ZW9yUnVudGltZUNvbmZpZykgcmV0dXJuIHRydWU7XG4gICAgYm9pbGVycGxhdGUuYmFzZURhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBib2lsZXJwbGF0ZS5iYXNlRGF0YSwge1xuICAgICAgbWV0ZW9yUnVudGltZUNvbmZpZyxcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG4gIHJ1bnRpbWVDb25maWcuaXNVcGRhdGVkQnlBcmNoW2FyY2hdID0gZmFsc2U7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3QuYXNzaWduKFxuICAgIHt9LFxuICAgIGJvaWxlcnBsYXRlLmJhc2VEYXRhLFxuICAgIHtcbiAgICAgIGh0bWxBdHRyaWJ1dGVzOiBnZXRIdG1sQXR0cmlidXRlcyhyZXF1ZXN0KSxcbiAgICB9LFxuICAgIF8ucGljayhyZXF1ZXN0LCAnZHluYW1pY0hlYWQnLCAnZHluYW1pY0JvZHknKVxuICApO1xuXG4gIGxldCBtYWRlQ2hhbmdlcyA9IGZhbHNlO1xuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIE9iamVjdC5rZXlzKGJvaWxlcnBsYXRlRGF0YUNhbGxiYWNrcykuZm9yRWFjaChrZXkgPT4ge1xuICAgIHByb21pc2UgPSBwcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNhbGxiYWNrID0gYm9pbGVycGxhdGVEYXRhQ2FsbGJhY2tzW2tleV07XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhyZXF1ZXN0LCBkYXRhLCBhcmNoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAvLyBDYWxsYmFja3Mgc2hvdWxkIHJldHVybiBmYWxzZSBpZiB0aGV5IGRpZCBub3QgbWFrZSBhbnkgY2hhbmdlcy5cbiAgICAgICAgaWYgKHJlc3VsdCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBtYWRlQ2hhbmdlcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+ICh7XG4gICAgc3RyZWFtOiBib2lsZXJwbGF0ZS50b0hUTUxTdHJlYW0oZGF0YSksXG4gICAgc3RhdHVzQ29kZTogZGF0YS5zdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IGRhdGEuaGVhZGVycyxcbiAgfSkpO1xufVxuXG4vKipcbiAqIEBuYW1lIGFkZFVwZGF0ZWROb3RpZnlIb29rQ2FsbGJhY2sob3B0aW9ucylcbiAqIEBzdW1tYXJ5IGNhbGxiYWNrIGhhbmRsZXIgZm9yIGBhZGR1cGRhdGVkTm90aWZ5SG9va2BcbiAqIEBpc3Byb3RvdHlwZSB0cnVlXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMuYXJjaCBUaGUgYXJjaGl0ZWN0dXJlIHRoYXQgaXMgYmVpbmcgdXBkYXRlZC5cbiAqIFRoaXMgY2FuIGJlIG9uZSBvZiBgd2ViLmJyb3dzZXJgLCBgd2ViLmJyb3dzZXIubGVnYWN5YCBvciBgd2ViLmNvcmRvdmFgLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMubWFuaWZlc3QgVGhlIG5ldyB1cGRhdGVkIG1hbmlmZXN0IG9iamVjdCBmb3JcbiAqIHRoaXMgYGFyY2hgLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMucnVudGltZUNvbmZpZyBUaGUgbmV3IHVwZGF0ZWQgY29uZmlndXJhdGlvblxuICogb2JqZWN0IGZvciB0aGlzIGBhcmNoYC5cbiAqL1xuXG4vKipcbiAqIEBzdW1tYXJ5IEhvb2sgdGhhdCBydW5zIHdoZW4gdGhlIG1ldGVvciBydW50aW1lIGNvbmZpZ3VyYXRpb25cbiAqIGlzIHVwZGF0ZWQuICBUeXBpY2FsbHkgdGhlIGNvbmZpZ3VyYXRpb24gb25seSBjaGFuZ2VzIGR1cmluZyBkZXZlbG9wbWVudCBtb2RlLlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHthZGRVcGRhdGVkTm90aWZ5SG9va0NhbGxiYWNrfSBoYW5kbGVyXG4gKiBUaGUgYGhhbmRsZXJgIGlzIGNhbGxlZCBvbiBldmVyeSBjaGFuZ2UgdG8gYW4gYGFyY2hgIHJ1bnRpbWUgY29uZmlndXJhdGlvbi5cbiAqIFNlZSBgYWRkVXBkYXRlZE5vdGlmeUhvb2tDYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSB7eyBzdG9wOiBmdW5jdGlvbiwgY2FsbGJhY2s6IGZ1bmN0aW9uIH19XG4gKi9cbldlYkFwcC5hZGRVcGRhdGVkTm90aWZ5SG9vayA9IGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgcmV0dXJuIHJ1bnRpbWVDb25maWcudXBkYXRlSG9va3MucmVnaXN0ZXIoaGFuZGxlcik7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZUluc3RhbmNlID0gZnVuY3Rpb24oXG4gIGFyY2gsXG4gIG1hbmlmZXN0LFxuICBhZGRpdGlvbmFsT3B0aW9uc1xuKSB7XG4gIGFkZGl0aW9uYWxPcHRpb25zID0gYWRkaXRpb25hbE9wdGlvbnMgfHwge307XG5cbiAgcnVudGltZUNvbmZpZy5pc1VwZGF0ZWRCeUFyY2hbYXJjaF0gPSB0cnVlO1xuICBjb25zdCBydGltZUNvbmZpZyA9IHtcbiAgICAuLi5fX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLFxuICAgIC4uLihhZGRpdGlvbmFsT3B0aW9ucy5ydW50aW1lQ29uZmlnT3ZlcnJpZGVzIHx8IHt9KSxcbiAgfTtcbiAgcnVudGltZUNvbmZpZy51cGRhdGVIb29rcy5mb3JFYWNoKGNiID0+IHtcbiAgICBjYih7IGFyY2gsIG1hbmlmZXN0LCBydW50aW1lQ29uZmlnOiBydGltZUNvbmZpZyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgY29uc3QgbWV0ZW9yUnVudGltZUNvbmZpZyA9IEpTT04uc3RyaW5naWZ5KFxuICAgIGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShydGltZUNvbmZpZykpXG4gICk7XG5cbiAgcmV0dXJuIG5ldyBCb2lsZXJwbGF0ZShcbiAgICBhcmNoLFxuICAgIG1hbmlmZXN0LFxuICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICB7XG4gICAgICAgIHBhdGhNYXBwZXIoaXRlbVBhdGgpIHtcbiAgICAgICAgICByZXR1cm4gcGF0aEpvaW4oYXJjaFBhdGhbYXJjaF0sIGl0ZW1QYXRoKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmFzZURhdGFFeHRlbnNpb246IHtcbiAgICAgICAgICBhZGRpdGlvbmFsU3RhdGljSnM6IF8ubWFwKGFkZGl0aW9uYWxTdGF0aWNKcyB8fCBbXSwgZnVuY3Rpb24oXG4gICAgICAgICAgICBjb250ZW50cyxcbiAgICAgICAgICAgIHBhdGhuYW1lXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBwYXRobmFtZTogcGF0aG5hbWUsXG4gICAgICAgICAgICAgIGNvbnRlbnRzOiBjb250ZW50cyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gQ29udmVydCB0byBhIEpTT04gc3RyaW5nLCB0aGVuIGdldCByaWQgb2YgbW9zdCB3ZWlyZCBjaGFyYWN0ZXJzLCB0aGVuXG4gICAgICAgICAgLy8gd3JhcCBpbiBkb3VibGUgcXVvdGVzLiAoVGhlIG91dGVybW9zdCBKU09OLnN0cmluZ2lmeSByZWFsbHkgb3VnaHQgdG9cbiAgICAgICAgICAvLyBqdXN0IGJlIFwid3JhcCBpbiBkb3VibGUgcXVvdGVzXCIgYnV0IHdlIHVzZSBpdCB0byBiZSBzYWZlLikgVGhpcyBtaWdodFxuICAgICAgICAgIC8vIGVuZCB1cCBpbnNpZGUgYSA8c2NyaXB0PiB0YWcgc28gd2UgbmVlZCB0byBiZSBjYXJlZnVsIHRvIG5vdCBpbmNsdWRlXG4gICAgICAgICAgLy8gXCI8L3NjcmlwdD5cIiwgYnV0IG5vcm1hbCB7e3NwYWNlYmFyc319IGVzY2FwaW5nIGVzY2FwZXMgdG9vIG11Y2ghIFNlZVxuICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2lzc3Vlcy8zNzMwXG4gICAgICAgICAgbWV0ZW9yUnVudGltZUNvbmZpZyxcbiAgICAgICAgICBtZXRlb3JSdW50aW1lSGFzaDogc2hhMShtZXRlb3JSdW50aW1lQ29uZmlnKSxcbiAgICAgICAgICByb290VXJsUGF0aFByZWZpeDpcbiAgICAgICAgICAgIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uUk9PVF9VUkxfUEFUSF9QUkVGSVggfHwgJycsXG4gICAgICAgICAgYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2s6IGJ1bmRsZWRKc0Nzc1VybFJld3JpdGVIb29rLFxuICAgICAgICAgIHNyaU1vZGU6IHNyaU1vZGUsXG4gICAgICAgICAgaW5saW5lU2NyaXB0c0FsbG93ZWQ6IFdlYkFwcEludGVybmFscy5pbmxpbmVTY3JpcHRzQWxsb3dlZCgpLFxuICAgICAgICAgIGlubGluZTogYWRkaXRpb25hbE9wdGlvbnMuaW5saW5lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICAgKVxuICApO1xufTtcblxuLy8gQSBtYXBwaW5nIGZyb20gdXJsIHBhdGggdG8gYXJjaGl0ZWN0dXJlIChlLmcuIFwid2ViLmJyb3dzZXJcIikgdG8gc3RhdGljXG4vLyBmaWxlIGluZm9ybWF0aW9uIHdpdGggdGhlIGZvbGxvd2luZyBmaWVsZHM6XG4vLyAtIHR5cGU6IHRoZSB0eXBlIG9mIGZpbGUgdG8gYmUgc2VydmVkXG4vLyAtIGNhY2hlYWJsZTogb3B0aW9uYWxseSwgd2hldGhlciB0aGUgZmlsZSBzaG91bGQgYmUgY2FjaGVkIG9yIG5vdFxuLy8gLSBzb3VyY2VNYXBVcmw6IG9wdGlvbmFsbHksIHRoZSB1cmwgb2YgdGhlIHNvdXJjZSBtYXBcbi8vXG4vLyBJbmZvIGFsc28gY29udGFpbnMgb25lIG9mIHRoZSBmb2xsb3dpbmc6XG4vLyAtIGNvbnRlbnQ6IHRoZSBzdHJpbmdpZmllZCBjb250ZW50IHRoYXQgc2hvdWxkIGJlIHNlcnZlZCBhdCB0aGlzIHBhdGhcbi8vIC0gYWJzb2x1dGVQYXRoOiB0aGUgYWJzb2x1dGUgcGF0aCBvbiBkaXNrIHRvIHRoZSBmaWxlXG5cbi8vIFNlcnZlIHN0YXRpYyBmaWxlcyBmcm9tIHRoZSBtYW5pZmVzdCBvciBhZGRlZCB3aXRoXG4vLyBgYWRkU3RhdGljSnNgLiBFeHBvcnRlZCBmb3IgdGVzdHMuXG5XZWJBcHBJbnRlcm5hbHMuc3RhdGljRmlsZXNNaWRkbGV3YXJlID0gYXN5bmMgZnVuY3Rpb24oXG4gIHN0YXRpY0ZpbGVzQnlBcmNoLFxuICByZXEsXG4gIHJlcyxcbiAgbmV4dFxuKSB7XG4gIHZhciBwYXRobmFtZSA9IHBhcnNlUmVxdWVzdChyZXEpLnBhdGhuYW1lO1xuICB0cnkge1xuICAgIHBhdGhuYW1lID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhdGhuYW1lKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIG5leHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgc2VydmVTdGF0aWNKcyA9IGZ1bmN0aW9uKHMpIHtcbiAgICBpZiAoXG4gICAgICByZXEubWV0aG9kID09PSAnR0VUJyB8fFxuICAgICAgcmVxLm1ldGhvZCA9PT0gJ0hFQUQnIHx8XG4gICAgICBNZXRlb3Iuc2V0dGluZ3MucGFja2FnZXM/LndlYmFwcD8uYWx3YXlzUmV0dXJuQ29udGVudFxuICAgICkge1xuICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHtcbiAgICAgICAgJ0NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0OyBjaGFyc2V0PVVURi04JyxcbiAgICAgICAgJ0NvbnRlbnQtTGVuZ3RoJzogQnVmZmVyLmJ5dGVMZW5ndGgocyksXG4gICAgICB9KTtcbiAgICAgIHJlcy53cml0ZShzKTtcbiAgICAgIHJlcy5lbmQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc3RhdHVzID0gcmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnID8gMjAwIDogNDA1O1xuICAgICAgcmVzLndyaXRlSGVhZChzdGF0dXMsIHtcbiAgICAgICAgQWxsb3c6ICdPUFRJT05TLCBHRVQsIEhFQUQnLFxuICAgICAgICAnQ29udGVudC1MZW5ndGgnOiAnMCcsXG4gICAgICB9KTtcbiAgICAgIHJlcy5lbmQoKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKFxuICAgIF8uaGFzKGFkZGl0aW9uYWxTdGF0aWNKcywgcGF0aG5hbWUpICYmXG4gICAgIVdlYkFwcEludGVybmFscy5pbmxpbmVTY3JpcHRzQWxsb3dlZCgpXG4gICkge1xuICAgIHNlcnZlU3RhdGljSnMoYWRkaXRpb25hbFN0YXRpY0pzW3BhdGhuYW1lXSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBhcmNoLCBwYXRoIH0gPSBXZWJBcHAuY2F0ZWdvcml6ZVJlcXVlc3QocmVxKTtcblxuICBpZiAoIWhhc093bi5jYWxsKFdlYkFwcC5jbGllbnRQcm9ncmFtcywgYXJjaCkpIHtcbiAgICAvLyBXZSBjb3VsZCBjb21lIGhlcmUgaW4gY2FzZSB3ZSBydW4gd2l0aCBzb21lIGFyY2hpdGVjdHVyZXMgZXhjbHVkZWRcbiAgICBuZXh0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gSWYgcGF1c2VDbGllbnQoYXJjaCkgaGFzIGJlZW4gY2FsbGVkLCBwcm9ncmFtLnBhdXNlZCB3aWxsIGJlIGFcbiAgLy8gUHJvbWlzZSB0aGF0IHdpbGwgYmUgcmVzb2x2ZWQgd2hlbiB0aGUgcHJvZ3JhbSBpcyB1bnBhdXNlZC5cbiAgY29uc3QgcHJvZ3JhbSA9IFdlYkFwcC5jbGllbnRQcm9ncmFtc1thcmNoXTtcbiAgYXdhaXQgcHJvZ3JhbS5wYXVzZWQ7XG5cbiAgaWYgKFxuICAgIHBhdGggPT09ICcvbWV0ZW9yX3J1bnRpbWVfY29uZmlnLmpzJyAmJlxuICAgICFXZWJBcHBJbnRlcm5hbHMuaW5saW5lU2NyaXB0c0FsbG93ZWQoKVxuICApIHtcbiAgICBzZXJ2ZVN0YXRpY0pzKFxuICAgICAgYF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18gPSAke3Byb2dyYW0ubWV0ZW9yUnVudGltZUNvbmZpZ307YFxuICAgICk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgaW5mbyA9IGdldFN0YXRpY0ZpbGVJbmZvKHN0YXRpY0ZpbGVzQnlBcmNoLCBwYXRobmFtZSwgcGF0aCwgYXJjaCk7XG4gIGlmICghaW5mbykge1xuICAgIG5leHQoKTtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gXCJzZW5kXCIgd2lsbCBoYW5kbGUgSEVBRCAmIEdFVCByZXF1ZXN0c1xuICBpZiAoXG4gICAgcmVxLm1ldGhvZCAhPT0gJ0hFQUQnICYmXG4gICAgcmVxLm1ldGhvZCAhPT0gJ0dFVCcgJiZcbiAgICAhTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy53ZWJhcHA/LmFsd2F5c1JldHVybkNvbnRlbnRcbiAgKSB7XG4gICAgY29uc3Qgc3RhdHVzID0gcmVxLm1ldGhvZCA9PT0gJ09QVElPTlMnID8gMjAwIDogNDA1O1xuICAgIHJlcy53cml0ZUhlYWQoc3RhdHVzLCB7XG4gICAgICBBbGxvdzogJ09QVElPTlMsIEdFVCwgSEVBRCcsXG4gICAgICAnQ29udGVudC1MZW5ndGgnOiAnMCcsXG4gICAgfSk7XG4gICAgcmVzLmVuZCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFdlIGRvbid0IG5lZWQgdG8gY2FsbCBwYXVzZSBiZWNhdXNlLCB1bmxpa2UgJ3N0YXRpYycsIG9uY2Ugd2UgY2FsbCBpbnRvXG4gIC8vICdzZW5kJyBhbmQgeWllbGQgdG8gdGhlIGV2ZW50IGxvb3AsIHdlIG5ldmVyIGNhbGwgYW5vdGhlciBoYW5kbGVyIHdpdGhcbiAgLy8gJ25leHQnLlxuXG4gIC8vIENhY2hlYWJsZSBmaWxlcyBhcmUgZmlsZXMgdGhhdCBzaG91bGQgbmV2ZXIgY2hhbmdlLiBUeXBpY2FsbHlcbiAgLy8gbmFtZWQgYnkgdGhlaXIgaGFzaCAoZWcgbWV0ZW9yIGJ1bmRsZWQganMgYW5kIGNzcyBmaWxlcykuXG4gIC8vIFdlIGNhY2hlIHRoZW0gfmZvcmV2ZXIgKDF5cikuXG4gIGNvbnN0IG1heEFnZSA9IGluZm8uY2FjaGVhYmxlID8gMTAwMCAqIDYwICogNjAgKiAyNCAqIDM2NSA6IDA7XG5cbiAgaWYgKGluZm8uY2FjaGVhYmxlKSB7XG4gICAgLy8gU2luY2Ugd2UgdXNlIHJlcS5oZWFkZXJzW1widXNlci1hZ2VudFwiXSB0byBkZXRlcm1pbmUgd2hldGhlciB0aGVcbiAgICAvLyBjbGllbnQgc2hvdWxkIHJlY2VpdmUgbW9kZXJuIG9yIGxlZ2FjeSByZXNvdXJjZXMsIHRlbGwgdGhlIGNsaWVudFxuICAgIC8vIHRvIGludmFsaWRhdGUgY2FjaGVkIHJlc291cmNlcyB3aGVuL2lmIGl0cyB1c2VyIGFnZW50IHN0cmluZ1xuICAgIC8vIGNoYW5nZXMgaW4gdGhlIGZ1dHVyZS5cbiAgICByZXMuc2V0SGVhZGVyKCdWYXJ5JywgJ1VzZXItQWdlbnQnKTtcbiAgfVxuXG4gIC8vIFNldCB0aGUgWC1Tb3VyY2VNYXAgaGVhZGVyLCB3aGljaCBjdXJyZW50IENocm9tZSwgRmlyZUZveCwgYW5kIFNhZmFyaVxuICAvLyB1bmRlcnN0YW5kLiAgKFRoZSBTb3VyY2VNYXAgaGVhZGVyIGlzIHNsaWdodGx5IG1vcmUgc3BlYy1jb3JyZWN0IGJ1dCBGRlxuICAvLyBkb2Vzbid0IHVuZGVyc3RhbmQgaXQuKVxuICAvL1xuICAvLyBZb3UgbWF5IGFsc28gbmVlZCB0byBlbmFibGUgc291cmNlIG1hcHMgaW4gQ2hyb21lOiBvcGVuIGRldiB0b29scywgY2xpY2tcbiAgLy8gdGhlIGdlYXIgaW4gdGhlIGJvdHRvbSByaWdodCBjb3JuZXIsIGFuZCBzZWxlY3QgXCJlbmFibGUgc291cmNlIG1hcHNcIi5cbiAgaWYgKGluZm8uc291cmNlTWFwVXJsKSB7XG4gICAgcmVzLnNldEhlYWRlcihcbiAgICAgICdYLVNvdXJjZU1hcCcsXG4gICAgICBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMX1BBVEhfUFJFRklYICsgaW5mby5zb3VyY2VNYXBVcmxcbiAgICApO1xuICB9XG5cbiAgaWYgKGluZm8udHlwZSA9PT0gJ2pzJyB8fCBpbmZvLnR5cGUgPT09ICdkeW5hbWljIGpzJykge1xuICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0OyBjaGFyc2V0PVVURi04Jyk7XG4gIH0gZWxzZSBpZiAoaW5mby50eXBlID09PSAnY3NzJykge1xuICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L2NzczsgY2hhcnNldD1VVEYtOCcpO1xuICB9IGVsc2UgaWYgKGluZm8udHlwZSA9PT0gJ2pzb24nKSB7XG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9VVRGLTgnKTtcbiAgfVxuXG4gIGlmIChpbmZvLmhhc2gpIHtcbiAgICByZXMuc2V0SGVhZGVyKCdFVGFnJywgJ1wiJyArIGluZm8uaGFzaCArICdcIicpO1xuICB9XG5cbiAgaWYgKGluZm8uY29udGVudCkge1xuICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtTGVuZ3RoJywgQnVmZmVyLmJ5dGVMZW5ndGgoaW5mby5jb250ZW50KSk7XG4gICAgcmVzLndyaXRlKGluZm8uY29udGVudCk7XG4gICAgcmVzLmVuZCgpO1xuICB9IGVsc2Uge1xuICAgIHNlbmQocmVxLCBpbmZvLmFic29sdXRlUGF0aCwge1xuICAgICAgbWF4YWdlOiBtYXhBZ2UsXG4gICAgICBkb3RmaWxlczogJ2FsbG93JywgLy8gaWYgd2Ugc3BlY2lmaWVkIGEgZG90ZmlsZSBpbiB0aGUgbWFuaWZlc3QsIHNlcnZlIGl0XG4gICAgICBsYXN0TW9kaWZpZWQ6IGZhbHNlLCAvLyBkb24ndCBzZXQgbGFzdC1tb2RpZmllZCBiYXNlZCBvbiB0aGUgZmlsZSBkYXRlXG4gICAgfSlcbiAgICAgIC5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgTG9nLmVycm9yKCdFcnJvciBzZXJ2aW5nIHN0YXRpYyBmaWxlICcgKyBlcnIpO1xuICAgICAgICByZXMud3JpdGVIZWFkKDUwMCk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH0pXG4gICAgICAub24oJ2RpcmVjdG9yeScsIGZ1bmN0aW9uKCkge1xuICAgICAgICBMb2cuZXJyb3IoJ1VuZXhwZWN0ZWQgZGlyZWN0b3J5ICcgKyBpbmZvLmFic29sdXRlUGF0aCk7XG4gICAgICAgIHJlcy53cml0ZUhlYWQoNTAwKTtcbiAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgfSlcbiAgICAgIC5waXBlKHJlcyk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldFN0YXRpY0ZpbGVJbmZvKHN0YXRpY0ZpbGVzQnlBcmNoLCBvcmlnaW5hbFBhdGgsIHBhdGgsIGFyY2gpIHtcbiAgaWYgKCFoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2gpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBHZXQgYSBsaXN0IG9mIGFsbCBhdmFpbGFibGUgc3RhdGljIGZpbGUgYXJjaGl0ZWN0dXJlcywgd2l0aCBhcmNoXG4gIC8vIGZpcnN0IGluIHRoZSBsaXN0IGlmIGl0IGV4aXN0cy5cbiAgY29uc3Qgc3RhdGljQXJjaExpc3QgPSBPYmplY3Qua2V5cyhzdGF0aWNGaWxlc0J5QXJjaCk7XG4gIGNvbnN0IGFyY2hJbmRleCA9IHN0YXRpY0FyY2hMaXN0LmluZGV4T2YoYXJjaCk7XG4gIGlmIChhcmNoSW5kZXggPiAwKSB7XG4gICAgc3RhdGljQXJjaExpc3QudW5zaGlmdChzdGF0aWNBcmNoTGlzdC5zcGxpY2UoYXJjaEluZGV4LCAxKVswXSk7XG4gIH1cblxuICBsZXQgaW5mbyA9IG51bGw7XG5cbiAgc3RhdGljQXJjaExpc3Quc29tZShhcmNoID0+IHtcbiAgICBjb25zdCBzdGF0aWNGaWxlcyA9IHN0YXRpY0ZpbGVzQnlBcmNoW2FyY2hdO1xuXG4gICAgZnVuY3Rpb24gZmluYWxpemUocGF0aCkge1xuICAgICAgaW5mbyA9IHN0YXRpY0ZpbGVzW3BhdGhdO1xuICAgICAgLy8gU29tZXRpbWVzIHdlIHJlZ2lzdGVyIGEgbGF6eSBmdW5jdGlvbiBpbnN0ZWFkIG9mIGFjdHVhbCBkYXRhIGluXG4gICAgICAvLyB0aGUgc3RhdGljRmlsZXMgbWFuaWZlc3QuXG4gICAgICBpZiAodHlwZW9mIGluZm8gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaW5mbyA9IHN0YXRpY0ZpbGVzW3BhdGhdID0gaW5mbygpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGluZm87XG4gICAgfVxuXG4gICAgLy8gSWYgc3RhdGljRmlsZXMgY29udGFpbnMgb3JpZ2luYWxQYXRoIHdpdGggdGhlIGFyY2ggaW5mZXJyZWQgYWJvdmUsXG4gICAgLy8gdXNlIHRoYXQgaW5mb3JtYXRpb24uXG4gICAgaWYgKGhhc093bi5jYWxsKHN0YXRpY0ZpbGVzLCBvcmlnaW5hbFBhdGgpKSB7XG4gICAgICByZXR1cm4gZmluYWxpemUob3JpZ2luYWxQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBJZiBjYXRlZ29yaXplUmVxdWVzdCByZXR1cm5lZCBhbiBhbHRlcm5hdGUgcGF0aCwgdHJ5IHRoYXQgaW5zdGVhZC5cbiAgICBpZiAocGF0aCAhPT0gb3JpZ2luYWxQYXRoICYmIGhhc093bi5jYWxsKHN0YXRpY0ZpbGVzLCBwYXRoKSkge1xuICAgICAgcmV0dXJuIGZpbmFsaXplKHBhdGgpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGluZm87XG59XG5cbi8vIFBhcnNlIHRoZSBwYXNzZWQgaW4gcG9ydCB2YWx1ZS4gUmV0dXJuIHRoZSBwb3J0IGFzLWlzIGlmIGl0J3MgYSBTdHJpbmdcbi8vIChlLmcuIGEgV2luZG93cyBTZXJ2ZXIgc3R5bGUgbmFtZWQgcGlwZSksIG90aGVyd2lzZSByZXR1cm4gdGhlIHBvcnQgYXMgYW5cbi8vIGludGVnZXIuXG4vL1xuLy8gREVQUkVDQVRFRDogRGlyZWN0IHVzZSBvZiB0aGlzIGZ1bmN0aW9uIGlzIG5vdCByZWNvbW1lbmRlZDsgaXQgaXMgbm9cbi8vIGxvbmdlciB1c2VkIGludGVybmFsbHksIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgcmVsZWFzZS5cbldlYkFwcEludGVybmFscy5wYXJzZVBvcnQgPSBwb3J0ID0+IHtcbiAgbGV0IHBhcnNlZFBvcnQgPSBwYXJzZUludChwb3J0KTtcbiAgaWYgKE51bWJlci5pc05hTihwYXJzZWRQb3J0KSkge1xuICAgIHBhcnNlZFBvcnQgPSBwb3J0O1xuICB9XG4gIHJldHVybiBwYXJzZWRQb3J0O1xufTtcblxuaW1wb3J0IHsgb25NZXNzYWdlIH0gZnJvbSAnbWV0ZW9yL2ludGVyLXByb2Nlc3MtbWVzc2FnaW5nJztcblxub25NZXNzYWdlKCd3ZWJhcHAtcGF1c2UtY2xpZW50JywgYXN5bmMgKHsgYXJjaCB9KSA9PiB7XG4gIFdlYkFwcEludGVybmFscy5wYXVzZUNsaWVudChhcmNoKTtcbn0pO1xuXG5vbk1lc3NhZ2UoJ3dlYmFwcC1yZWxvYWQtY2xpZW50JywgYXN5bmMgKHsgYXJjaCB9KSA9PiB7XG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUNsaWVudFByb2dyYW0oYXJjaCk7XG59KTtcblxuZnVuY3Rpb24gcnVuV2ViQXBwU2VydmVyKCkge1xuICB2YXIgc2h1dHRpbmdEb3duID0gZmFsc2U7XG4gIHZhciBzeW5jUXVldWUgPSBuZXcgTWV0ZW9yLl9TeW5jaHJvbm91c1F1ZXVlKCk7XG5cbiAgdmFyIGdldEl0ZW1QYXRobmFtZSA9IGZ1bmN0aW9uKGl0ZW1VcmwpIHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlVXJsKGl0ZW1VcmwpLnBhdGhuYW1lKTtcbiAgfTtcblxuICBXZWJBcHBJbnRlcm5hbHMucmVsb2FkQ2xpZW50UHJvZ3JhbXMgPSBmdW5jdGlvbigpIHtcbiAgICBzeW5jUXVldWUucnVuVGFzayhmdW5jdGlvbigpIHtcbiAgICAgIGNvbnN0IHN0YXRpY0ZpbGVzQnlBcmNoID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgICAgY29uc3QgeyBjb25maWdKc29uIH0gPSBfX21ldGVvcl9ib290c3RyYXBfXztcbiAgICAgIGNvbnN0IGNsaWVudEFyY2hzID1cbiAgICAgICAgY29uZmlnSnNvbi5jbGllbnRBcmNocyB8fCBPYmplY3Qua2V5cyhjb25maWdKc29uLmNsaWVudFBhdGhzKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY2xpZW50QXJjaHMuZm9yRWFjaChhcmNoID0+IHtcbiAgICAgICAgICBnZW5lcmF0ZUNsaWVudFByb2dyYW0oYXJjaCwgc3RhdGljRmlsZXNCeUFyY2gpO1xuICAgICAgICB9KTtcbiAgICAgICAgV2ViQXBwSW50ZXJuYWxzLnN0YXRpY0ZpbGVzQnlBcmNoID0gc3RhdGljRmlsZXNCeUFyY2g7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIExvZy5lcnJvcignRXJyb3IgcmVsb2FkaW5nIHRoZSBjbGllbnQgcHJvZ3JhbTogJyArIGUuc3RhY2spO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gUGF1c2UgYW55IGluY29taW5nIHJlcXVlc3RzIGFuZCBtYWtlIHRoZW0gd2FpdCBmb3IgdGhlIHByb2dyYW0gdG8gYmVcbiAgLy8gdW5wYXVzZWQgdGhlIG5leHQgdGltZSBnZW5lcmF0ZUNsaWVudFByb2dyYW0oYXJjaCkgaXMgY2FsbGVkLlxuICBXZWJBcHBJbnRlcm5hbHMucGF1c2VDbGllbnQgPSBmdW5jdGlvbihhcmNoKSB7XG4gICAgc3luY1F1ZXVlLnJ1blRhc2soKCkgPT4ge1xuICAgICAgY29uc3QgcHJvZ3JhbSA9IFdlYkFwcC5jbGllbnRQcm9ncmFtc1thcmNoXTtcbiAgICAgIGNvbnN0IHsgdW5wYXVzZSB9ID0gcHJvZ3JhbTtcbiAgICAgIHByb2dyYW0ucGF1c2VkID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdW5wYXVzZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIC8vIElmIHRoZXJlIGhhcHBlbnMgdG8gYmUgYW4gZXhpc3RpbmcgcHJvZ3JhbS51bnBhdXNlIGZ1bmN0aW9uLFxuICAgICAgICAgIC8vIGNvbXBvc2UgaXQgd2l0aCB0aGUgcmVzb2x2ZSBmdW5jdGlvbi5cbiAgICAgICAgICBwcm9ncmFtLnVucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHVucGF1c2UoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHByb2dyYW0udW5wYXVzZSA9IHJlc29sdmU7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUNsaWVudFByb2dyYW0gPSBmdW5jdGlvbihhcmNoKSB7XG4gICAgc3luY1F1ZXVlLnJ1blRhc2soKCkgPT4gZ2VuZXJhdGVDbGllbnRQcm9ncmFtKGFyY2gpKTtcbiAgfTtcblxuICBmdW5jdGlvbiBnZW5lcmF0ZUNsaWVudFByb2dyYW0oXG4gICAgYXJjaCxcbiAgICBzdGF0aWNGaWxlc0J5QXJjaCA9IFdlYkFwcEludGVybmFscy5zdGF0aWNGaWxlc0J5QXJjaFxuICApIHtcbiAgICBjb25zdCBjbGllbnREaXIgPSBwYXRoSm9pbihcbiAgICAgIHBhdGhEaXJuYW1lKF9fbWV0ZW9yX2Jvb3RzdHJhcF9fLnNlcnZlckRpciksXG4gICAgICBhcmNoXG4gICAgKTtcblxuICAgIC8vIHJlYWQgdGhlIGNvbnRyb2wgZm9yIHRoZSBjbGllbnQgd2UnbGwgYmUgc2VydmluZyB1cFxuICAgIGNvbnN0IHByb2dyYW1Kc29uUGF0aCA9IHBhdGhKb2luKGNsaWVudERpciwgJ3Byb2dyYW0uanNvbicpO1xuXG4gICAgbGV0IHByb2dyYW1Kc29uO1xuICAgIHRyeSB7XG4gICAgICBwcm9ncmFtSnNvbiA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKHByb2dyYW1Kc29uUGF0aCkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlLmNvZGUgPT09ICdFTk9FTlQnKSByZXR1cm47XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIGlmIChwcm9ncmFtSnNvbi5mb3JtYXQgIT09ICd3ZWItcHJvZ3JhbS1wcmUxJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnVW5zdXBwb3J0ZWQgZm9ybWF0IGZvciBjbGllbnQgYXNzZXRzOiAnICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShwcm9ncmFtSnNvbi5mb3JtYXQpXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbUpzb25QYXRoIHx8ICFjbGllbnREaXIgfHwgIXByb2dyYW1Kc29uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaWVudCBjb25maWcgZmlsZSBub3QgcGFyc2VkLicpO1xuICAgIH1cblxuICAgIGFyY2hQYXRoW2FyY2hdID0gY2xpZW50RGlyO1xuICAgIGNvbnN0IHN0YXRpY0ZpbGVzID0gKHN0YXRpY0ZpbGVzQnlBcmNoW2FyY2hdID0gT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cbiAgICBjb25zdCB7IG1hbmlmZXN0IH0gPSBwcm9ncmFtSnNvbjtcbiAgICBtYW5pZmVzdC5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgaWYgKGl0ZW0udXJsICYmIGl0ZW0ud2hlcmUgPT09ICdjbGllbnQnKSB7XG4gICAgICAgIHN0YXRpY0ZpbGVzW2dldEl0ZW1QYXRobmFtZShpdGVtLnVybCldID0ge1xuICAgICAgICAgIGFic29sdXRlUGF0aDogcGF0aEpvaW4oY2xpZW50RGlyLCBpdGVtLnBhdGgpLFxuICAgICAgICAgIGNhY2hlYWJsZTogaXRlbS5jYWNoZWFibGUsXG4gICAgICAgICAgaGFzaDogaXRlbS5oYXNoLFxuICAgICAgICAgIC8vIExpbmsgZnJvbSBzb3VyY2UgdG8gaXRzIG1hcFxuICAgICAgICAgIHNvdXJjZU1hcFVybDogaXRlbS5zb3VyY2VNYXBVcmwsXG4gICAgICAgICAgdHlwZTogaXRlbS50eXBlLFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpdGVtLnNvdXJjZU1hcCkge1xuICAgICAgICAgIC8vIFNlcnZlIHRoZSBzb3VyY2UgbWFwIHRvbywgdW5kZXIgdGhlIHNwZWNpZmllZCBVUkwuIFdlIGFzc3VtZVxuICAgICAgICAgIC8vIGFsbCBzb3VyY2UgbWFwcyBhcmUgY2FjaGVhYmxlLlxuICAgICAgICAgIHN0YXRpY0ZpbGVzW2dldEl0ZW1QYXRobmFtZShpdGVtLnNvdXJjZU1hcFVybCldID0ge1xuICAgICAgICAgICAgYWJzb2x1dGVQYXRoOiBwYXRoSm9pbihjbGllbnREaXIsIGl0ZW0uc291cmNlTWFwKSxcbiAgICAgICAgICAgIGNhY2hlYWJsZTogdHJ1ZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IFBVQkxJQ19TRVRUSU5HUyB9ID0gX19tZXRlb3JfcnVudGltZV9jb25maWdfXztcbiAgICBjb25zdCBjb25maWdPdmVycmlkZXMgPSB7XG4gICAgICBQVUJMSUNfU0VUVElOR1MsXG4gICAgfTtcblxuICAgIGNvbnN0IG9sZFByb2dyYW0gPSBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF07XG4gICAgY29uc3QgbmV3UHJvZ3JhbSA9IChXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF0gPSB7XG4gICAgICBmb3JtYXQ6ICd3ZWItcHJvZ3JhbS1wcmUxJyxcbiAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdCxcbiAgICAgIC8vIFVzZSBhcnJvdyBmdW5jdGlvbnMgc28gdGhhdCB0aGVzZSB2ZXJzaW9ucyBjYW4gYmUgbGF6aWx5XG4gICAgICAvLyBjYWxjdWxhdGVkIGxhdGVyLCBhbmQgc28gdGhhdCB0aGV5IHdpbGwgbm90IGJlIGluY2x1ZGVkIGluIHRoZVxuICAgICAgLy8gc3RhdGljRmlsZXNbbWFuaWZlc3RVcmxdLmNvbnRlbnQgc3RyaW5nIGJlbG93LlxuICAgICAgLy9cbiAgICAgIC8vIE5vdGU6IHRoZXNlIHZlcnNpb24gY2FsY3VsYXRpb25zIG11c3QgYmUga2VwdCBpbiBhZ3JlZW1lbnQgd2l0aFxuICAgICAgLy8gQ29yZG92YUJ1aWxkZXIjYXBwZW5kVmVyc2lvbiBpbiB0b29scy9jb3Jkb3ZhL2J1aWxkZXIuanMsIG9yIGhvdFxuICAgICAgLy8gY29kZSBwdXNoIHdpbGwgcmVsb2FkIENvcmRvdmEgYXBwcyB1bm5lY2Vzc2FyaWx5LlxuICAgICAgdmVyc2lvbjogKCkgPT5cbiAgICAgICAgV2ViQXBwSGFzaGluZy5jYWxjdWxhdGVDbGllbnRIYXNoKG1hbmlmZXN0LCBudWxsLCBjb25maWdPdmVycmlkZXMpLFxuICAgICAgdmVyc2lvblJlZnJlc2hhYmxlOiAoKSA9PlxuICAgICAgICBXZWJBcHBIYXNoaW5nLmNhbGN1bGF0ZUNsaWVudEhhc2goXG4gICAgICAgICAgbWFuaWZlc3QsXG4gICAgICAgICAgdHlwZSA9PiB0eXBlID09PSAnY3NzJyxcbiAgICAgICAgICBjb25maWdPdmVycmlkZXNcbiAgICAgICAgKSxcbiAgICAgIHZlcnNpb25Ob25SZWZyZXNoYWJsZTogKCkgPT5cbiAgICAgICAgV2ViQXBwSGFzaGluZy5jYWxjdWxhdGVDbGllbnRIYXNoKFxuICAgICAgICAgIG1hbmlmZXN0LFxuICAgICAgICAgICh0eXBlLCByZXBsYWNlYWJsZSkgPT4gdHlwZSAhPT0gJ2NzcycgJiYgIXJlcGxhY2VhYmxlLFxuICAgICAgICAgIGNvbmZpZ092ZXJyaWRlc1xuICAgICAgICApLFxuICAgICAgdmVyc2lvblJlcGxhY2VhYmxlOiAoKSA9PlxuICAgICAgICBXZWJBcHBIYXNoaW5nLmNhbGN1bGF0ZUNsaWVudEhhc2goXG4gICAgICAgICAgbWFuaWZlc3QsXG4gICAgICAgICAgKF90eXBlLCByZXBsYWNlYWJsZSkgPT4gcmVwbGFjZWFibGUsXG4gICAgICAgICAgY29uZmlnT3ZlcnJpZGVzXG4gICAgICAgICksXG4gICAgICBjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zOiBwcm9ncmFtSnNvbi5jb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zLFxuICAgICAgUFVCTElDX1NFVFRJTkdTLFxuICAgICAgaG1yVmVyc2lvbjogcHJvZ3JhbUpzb24uaG1yVmVyc2lvbixcbiAgICB9KTtcblxuICAgIC8vIEV4cG9zZSBwcm9ncmFtIGRldGFpbHMgYXMgYSBzdHJpbmcgcmVhY2hhYmxlIHZpYSB0aGUgZm9sbG93aW5nIFVSTC5cbiAgICBjb25zdCBtYW5pZmVzdFVybFByZWZpeCA9ICcvX18nICsgYXJjaC5yZXBsYWNlKC9ed2ViXFwuLywgJycpO1xuICAgIGNvbnN0IG1hbmlmZXN0VXJsID0gbWFuaWZlc3RVcmxQcmVmaXggKyBnZXRJdGVtUGF0aG5hbWUoJy9tYW5pZmVzdC5qc29uJyk7XG5cbiAgICBzdGF0aWNGaWxlc1ttYW5pZmVzdFVybF0gPSAoKSA9PiB7XG4gICAgICBpZiAoUGFja2FnZS5hdXRvdXBkYXRlKSB7XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBBVVRPVVBEQVRFX1ZFUlNJT04gPSBQYWNrYWdlLmF1dG91cGRhdGUuQXV0b3VwZGF0ZS5hdXRvdXBkYXRlVmVyc2lvbixcbiAgICAgICAgfSA9IHByb2Nlc3MuZW52O1xuXG4gICAgICAgIGlmIChBVVRPVVBEQVRFX1ZFUlNJT04pIHtcbiAgICAgICAgICBuZXdQcm9ncmFtLnZlcnNpb24gPSBBVVRPVVBEQVRFX1ZFUlNJT047XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBuZXdQcm9ncmFtLnZlcnNpb24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgbmV3UHJvZ3JhbS52ZXJzaW9uID0gbmV3UHJvZ3JhbS52ZXJzaW9uKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvbnRlbnQ6IEpTT04uc3RyaW5naWZ5KG5ld1Byb2dyYW0pLFxuICAgICAgICBjYWNoZWFibGU6IGZhbHNlLFxuICAgICAgICBoYXNoOiBuZXdQcm9ncmFtLnZlcnNpb24sXG4gICAgICAgIHR5cGU6ICdqc29uJyxcbiAgICAgIH07XG4gICAgfTtcblxuICAgIGdlbmVyYXRlQm9pbGVycGxhdGVGb3JBcmNoKGFyY2gpO1xuXG4gICAgLy8gSWYgdGhlcmUgYXJlIGFueSByZXF1ZXN0cyB3YWl0aW5nIG9uIG9sZFByb2dyYW0ucGF1c2VkLCBsZXQgdGhlbVxuICAgIC8vIGNvbnRpbnVlIG5vdyAodXNpbmcgdGhlIG5ldyBwcm9ncmFtKS5cbiAgICBpZiAob2xkUHJvZ3JhbSAmJiBvbGRQcm9ncmFtLnBhdXNlZCkge1xuICAgICAgb2xkUHJvZ3JhbS51bnBhdXNlKCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZGVmYXVsdE9wdGlvbnNGb3JBcmNoID0ge1xuICAgICd3ZWIuY29yZG92YSc6IHtcbiAgICAgIHJ1bnRpbWVDb25maWdPdmVycmlkZXM6IHtcbiAgICAgICAgLy8gWFhYIFdlIHVzZSBhYnNvbHV0ZVVybCgpIGhlcmUgc28gdGhhdCB3ZSBzZXJ2ZSBodHRwczovL1xuICAgICAgICAvLyBVUkxzIHRvIGNvcmRvdmEgY2xpZW50cyBpZiBmb3JjZS1zc2wgaXMgaW4gdXNlLiBJZiB3ZSB3ZXJlXG4gICAgICAgIC8vIHRvIHVzZSBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLlJPT1RfVVJMIGluc3RlYWQgb2ZcbiAgICAgICAgLy8gYWJzb2x1dGVVcmwoKSwgdGhlbiBDb3Jkb3ZhIGNsaWVudHMgd291bGQgaW1tZWRpYXRlbHkgZ2V0IGFcbiAgICAgICAgLy8gSENQIHNldHRpbmcgdGhlaXIgRERQX0RFRkFVTFRfQ09OTkVDVElPTl9VUkwgdG9cbiAgICAgICAgLy8gaHR0cDovL2V4YW1wbGUubWV0ZW9yLmNvbS4gVGhpcyBicmVha3MgdGhlIGFwcCwgYmVjYXVzZVxuICAgICAgICAvLyBmb3JjZS1zc2wgZG9lc24ndCBzZXJ2ZSBDT1JTIGhlYWRlcnMgb24gMzAyXG4gICAgICAgIC8vIHJlZGlyZWN0cy4gKFBsdXMgaXQncyB1bmRlc2lyYWJsZSB0byBoYXZlIGNsaWVudHNcbiAgICAgICAgLy8gY29ubmVjdGluZyB0byBodHRwOi8vZXhhbXBsZS5tZXRlb3IuY29tIHdoZW4gZm9yY2Utc3NsIGlzXG4gICAgICAgIC8vIGluIHVzZS4pXG4gICAgICAgIEREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMOlxuICAgICAgICAgIHByb2Nlc3MuZW52Lk1PQklMRV9ERFBfVVJMIHx8IE1ldGVvci5hYnNvbHV0ZVVybCgpLFxuICAgICAgICBST09UX1VSTDogcHJvY2Vzcy5lbnYuTU9CSUxFX1JPT1RfVVJMIHx8IE1ldGVvci5hYnNvbHV0ZVVybCgpLFxuICAgICAgfSxcbiAgICB9LFxuXG4gICAgJ3dlYi5icm93c2VyJzoge1xuICAgICAgcnVudGltZUNvbmZpZ092ZXJyaWRlczoge1xuICAgICAgICBpc01vZGVybjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcblxuICAgICd3ZWIuYnJvd3Nlci5sZWdhY3knOiB7XG4gICAgICBydW50aW1lQ29uZmlnT3ZlcnJpZGVzOiB7XG4gICAgICAgIGlzTW9kZXJuOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcblxuICBXZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIC8vIFRoaXMgYm9pbGVycGxhdGUgd2lsbCBiZSBzZXJ2ZWQgdG8gdGhlIG1vYmlsZSBkZXZpY2VzIHdoZW4gdXNlZCB3aXRoXG4gICAgLy8gTWV0ZW9yL0NvcmRvdmEgZm9yIHRoZSBIb3QtQ29kZSBQdXNoIGFuZCBzaW5jZSB0aGUgZmlsZSB3aWxsIGJlIHNlcnZlZCBieVxuICAgIC8vIHRoZSBkZXZpY2UncyBzZXJ2ZXIsIGl0IGlzIGltcG9ydGFudCB0byBzZXQgdGhlIEREUCB1cmwgdG8gdGhlIGFjdHVhbFxuICAgIC8vIE1ldGVvciBzZXJ2ZXIgYWNjZXB0aW5nIEREUCBjb25uZWN0aW9ucyBhbmQgbm90IHRoZSBkZXZpY2UncyBmaWxlIHNlcnZlci5cbiAgICBzeW5jUXVldWUucnVuVGFzayhmdW5jdGlvbigpIHtcbiAgICAgIE9iamVjdC5rZXlzKFdlYkFwcC5jbGllbnRQcm9ncmFtcykuZm9yRWFjaChnZW5lcmF0ZUJvaWxlcnBsYXRlRm9yQXJjaCk7XG4gICAgfSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gZ2VuZXJhdGVCb2lsZXJwbGF0ZUZvckFyY2goYXJjaCkge1xuICAgIGNvbnN0IHByb2dyYW0gPSBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF07XG4gICAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSBkZWZhdWx0T3B0aW9uc0ZvckFyY2hbYXJjaF0gfHwge307XG4gICAgY29uc3QgeyBiYXNlRGF0YSB9ID0gKGJvaWxlcnBsYXRlQnlBcmNoW1xuICAgICAgYXJjaFxuICAgIF0gPSBXZWJBcHBJbnRlcm5hbHMuZ2VuZXJhdGVCb2lsZXJwbGF0ZUluc3RhbmNlKFxuICAgICAgYXJjaCxcbiAgICAgIHByb2dyYW0ubWFuaWZlc3QsXG4gICAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICAgICkpO1xuICAgIC8vIFdlIG5lZWQgdGhlIHJ1bnRpbWUgY29uZmlnIHdpdGggb3ZlcnJpZGVzIGZvciBtZXRlb3JfcnVudGltZV9jb25maWcuanM6XG4gICAgcHJvZ3JhbS5tZXRlb3JSdW50aW1lQ29uZmlnID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgLi4uX19tZXRlb3JfcnVudGltZV9jb25maWdfXyxcbiAgICAgIC4uLihhZGRpdGlvbmFsT3B0aW9ucy5ydW50aW1lQ29uZmlnT3ZlcnJpZGVzIHx8IG51bGwpLFxuICAgIH0pO1xuICAgIHByb2dyYW0ucmVmcmVzaGFibGVBc3NldHMgPSBiYXNlRGF0YS5jc3MubWFwKGZpbGUgPT4gKHtcbiAgICAgIHVybDogYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2soZmlsZS51cmwpLFxuICAgIH0pKTtcbiAgfVxuXG4gIFdlYkFwcEludGVybmFscy5yZWxvYWRDbGllbnRQcm9ncmFtcygpO1xuXG4gIC8vIHdlYnNlcnZlclxuICB2YXIgYXBwID0gY29ubmVjdCgpO1xuXG4gIC8vIFBhY2thZ2VzIGFuZCBhcHBzIGNhbiBhZGQgaGFuZGxlcnMgdGhhdCBydW4gYmVmb3JlIGFueSBvdGhlciBNZXRlb3JcbiAgLy8gaGFuZGxlcnMgdmlhIFdlYkFwcC5yYXdDb25uZWN0SGFuZGxlcnMuXG4gIHZhciByYXdDb25uZWN0SGFuZGxlcnMgPSBjb25uZWN0KCk7XG4gIGFwcC51c2UocmF3Q29ubmVjdEhhbmRsZXJzKTtcblxuICAvLyBBdXRvLWNvbXByZXNzIGFueSBqc29uLCBqYXZhc2NyaXB0LCBvciB0ZXh0LlxuICBhcHAudXNlKGNvbXByZXNzKHsgZmlsdGVyOiBzaG91bGRDb21wcmVzcyB9KSk7XG5cbiAgLy8gcGFyc2UgY29va2llcyBpbnRvIGFuIG9iamVjdFxuICBhcHAudXNlKGNvb2tpZVBhcnNlcigpKTtcblxuICAvLyBXZSdyZSBub3QgYSBwcm94eTsgcmVqZWN0ICh3aXRob3V0IGNyYXNoaW5nKSBhdHRlbXB0cyB0byB0cmVhdCB1cyBsaWtlXG4gIC8vIG9uZS4gKFNlZSAjMTIxMi4pXG4gIGFwcC51c2UoZnVuY3Rpb24ocmVxLCByZXMsIG5leHQpIHtcbiAgICBpZiAoUm91dGVQb2xpY3kuaXNWYWxpZFVybChyZXEudXJsKSkge1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXMud3JpdGVIZWFkKDQwMCk7XG4gICAgcmVzLndyaXRlKCdOb3QgYSBwcm94eScpO1xuICAgIHJlcy5lbmQoKTtcbiAgfSk7XG5cbiAgLy8gUGFyc2UgdGhlIHF1ZXJ5IHN0cmluZyBpbnRvIHJlcy5xdWVyeS4gVXNlZCBieSBvYXV0aF9zZXJ2ZXIsIGJ1dCBpdCdzXG4gIC8vIGdlbmVyYWxseSBwcmV0dHkgaGFuZHkuLlxuICAvL1xuICAvLyBEbyB0aGlzIGJlZm9yZSB0aGUgbmV4dCBtaWRkbGV3YXJlIGRlc3Ryb3lzIHJlcS51cmwgaWYgYSBwYXRoIHByZWZpeFxuICAvLyBpcyBzZXQgdG8gY2xvc2UgIzEwMTExLlxuICBhcHAudXNlKGZ1bmN0aW9uKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0KSB7XG4gICAgcmVxdWVzdC5xdWVyeSA9IHFzLnBhcnNlKHBhcnNlVXJsKHJlcXVlc3QudXJsKS5xdWVyeSk7XG4gICAgbmV4dCgpO1xuICB9KTtcblxuICBmdW5jdGlvbiBnZXRQYXRoUGFydHMocGF0aCkge1xuICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLycpO1xuICAgIHdoaWxlIChwYXJ0c1swXSA9PT0gJycpIHBhcnRzLnNoaWZ0KCk7XG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNQcmVmaXhPZihwcmVmaXgsIGFycmF5KSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHByZWZpeC5sZW5ndGggPD0gYXJyYXkubGVuZ3RoICYmXG4gICAgICBwcmVmaXguZXZlcnkoKHBhcnQsIGkpID0+IHBhcnQgPT09IGFycmF5W2ldKVxuICAgICk7XG4gIH1cblxuICAvLyBTdHJpcCBvZmYgdGhlIHBhdGggcHJlZml4LCBpZiBpdCBleGlzdHMuXG4gIGFwcC51c2UoZnVuY3Rpb24ocmVxdWVzdCwgcmVzcG9uc2UsIG5leHQpIHtcbiAgICBjb25zdCBwYXRoUHJlZml4ID0gX19tZXRlb3JfcnVudGltZV9jb25maWdfXy5ST09UX1VSTF9QQVRIX1BSRUZJWDtcbiAgICBjb25zdCB7IHBhdGhuYW1lLCBzZWFyY2ggfSA9IHBhcnNlVXJsKHJlcXVlc3QudXJsKTtcblxuICAgIC8vIGNoZWNrIGlmIHRoZSBwYXRoIGluIHRoZSB1cmwgc3RhcnRzIHdpdGggdGhlIHBhdGggcHJlZml4XG4gICAgaWYgKHBhdGhQcmVmaXgpIHtcbiAgICAgIGNvbnN0IHByZWZpeFBhcnRzID0gZ2V0UGF0aFBhcnRzKHBhdGhQcmVmaXgpO1xuICAgICAgY29uc3QgcGF0aFBhcnRzID0gZ2V0UGF0aFBhcnRzKHBhdGhuYW1lKTtcbiAgICAgIGlmIChpc1ByZWZpeE9mKHByZWZpeFBhcnRzLCBwYXRoUGFydHMpKSB7XG4gICAgICAgIHJlcXVlc3QudXJsID0gJy8nICsgcGF0aFBhcnRzLnNsaWNlKHByZWZpeFBhcnRzLmxlbmd0aCkuam9pbignLycpO1xuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgcmVxdWVzdC51cmwgKz0gc2VhcmNoO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2Zhdmljb24uaWNvJyB8fCBwYXRobmFtZSA9PT0gJy9yb2JvdHMudHh0Jykge1xuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICBpZiAocGF0aFByZWZpeCkge1xuICAgICAgcmVzcG9uc2Uud3JpdGVIZWFkKDQwNCk7XG4gICAgICByZXNwb25zZS53cml0ZSgnVW5rbm93biBwYXRoJyk7XG4gICAgICByZXNwb25zZS5lbmQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBuZXh0KCk7XG4gIH0pO1xuXG4gIC8vIFNlcnZlIHN0YXRpYyBmaWxlcyBmcm9tIHRoZSBtYW5pZmVzdC5cbiAgLy8gVGhpcyBpcyBpbnNwaXJlZCBieSB0aGUgJ3N0YXRpYycgbWlkZGxld2FyZS5cbiAgYXBwLnVzZShmdW5jdGlvbihyZXEsIHJlcywgbmV4dCkge1xuICAgIFdlYkFwcEludGVybmFscy5zdGF0aWNGaWxlc01pZGRsZXdhcmUoXG4gICAgICBXZWJBcHBJbnRlcm5hbHMuc3RhdGljRmlsZXNCeUFyY2gsXG4gICAgICByZXEsXG4gICAgICByZXMsXG4gICAgICBuZXh0XG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gQ29yZSBNZXRlb3IgcGFja2FnZXMgbGlrZSBkeW5hbWljLWltcG9ydCBjYW4gYWRkIGhhbmRsZXJzIGJlZm9yZVxuICAvLyBvdGhlciBoYW5kbGVycyBhZGRlZCBieSBwYWNrYWdlIGFuZCBhcHBsaWNhdGlvbiBjb2RlLlxuICBhcHAudXNlKChXZWJBcHBJbnRlcm5hbHMubWV0ZW9ySW50ZXJuYWxIYW5kbGVycyA9IGNvbm5lY3QoKSkpO1xuXG4gIC8qKlxuICAgKiBAbmFtZSBjb25uZWN0SGFuZGxlcnNDYWxsYmFjayhyZXEsIHJlcywgbmV4dClcbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAaXNwcm90b3R5cGUgdHJ1ZVxuICAgKiBAc3VtbWFyeSBjYWxsYmFjayBoYW5kbGVyIGZvciBgV2ViQXBwLmNvbm5lY3RIYW5kbGVyc2BcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcVxuICAgKiBhIE5vZGUuanNcbiAgICogW0luY29taW5nTWVzc2FnZV0oaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9odHRwLmh0bWwjaHR0cF9jbGFzc19odHRwX2luY29taW5nbWVzc2FnZSlcbiAgICogb2JqZWN0IHdpdGggc29tZSBleHRyYSBwcm9wZXJ0aWVzLiBUaGlzIGFyZ3VtZW50IGNhbiBiZSB1c2VkXG4gICAqICB0byBnZXQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGluY29taW5nIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNcbiAgICogYSBOb2RlLmpzXG4gICAqIFtTZXJ2ZXJSZXNwb25zZV0oaHR0cDovL25vZGVqcy5vcmcvYXBpL2h0dHAuaHRtbCNodHRwX2NsYXNzX2h0dHBfc2VydmVycmVzcG9uc2UpXG4gICAqIG9iamVjdC4gVXNlIHRoaXMgdG8gd3JpdGUgZGF0YSB0aGF0IHNob3VsZCBiZSBzZW50IGluIHJlc3BvbnNlIHRvIHRoZVxuICAgKiByZXF1ZXN0LCBhbmQgY2FsbCBgcmVzLmVuZCgpYCB3aGVuIHlvdSBhcmUgZG9uZS5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxuICAgKiBDYWxsaW5nIHRoaXMgZnVuY3Rpb24gd2lsbCBwYXNzIG9uIHRoZSBoYW5kbGluZyBvZlxuICAgKiB0aGlzIHJlcXVlc3QgdG8gdGhlIG5leHQgcmVsZXZhbnQgaGFuZGxlci5cbiAgICpcbiAgICovXG5cbiAgLyoqXG4gICAqIEBtZXRob2QgY29ubmVjdEhhbmRsZXJzXG4gICAqIEBtZW1iZXJvZiBXZWJBcHBcbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAc3VtbWFyeSBSZWdpc3RlciBhIGhhbmRsZXIgZm9yIGFsbCBIVFRQIHJlcXVlc3RzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW3BhdGhdXG4gICAqIFRoaXMgaGFuZGxlciB3aWxsIG9ubHkgYmUgY2FsbGVkIG9uIHBhdGhzIHRoYXQgbWF0Y2hcbiAgICogdGhpcyBzdHJpbmcuIFRoZSBtYXRjaCBoYXMgdG8gYm9yZGVyIG9uIGEgYC9gIG9yIGEgYC5gLlxuICAgKlxuICAgKiBGb3IgZXhhbXBsZSwgYC9oZWxsb2Agd2lsbCBtYXRjaCBgL2hlbGxvL3dvcmxkYCBhbmRcbiAgICogYC9oZWxsby53b3JsZGAsIGJ1dCBub3QgYC9oZWxsb193b3JsZGAuXG4gICAqIEBwYXJhbSB7Y29ubmVjdEhhbmRsZXJzQ2FsbGJhY2t9IGhhbmRsZXJcbiAgICogQSBoYW5kbGVyIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgb24gSFRUUCByZXF1ZXN0cy5cbiAgICogU2VlIGBjb25uZWN0SGFuZGxlcnNDYWxsYmFja2BcbiAgICpcbiAgICovXG4gIC8vIFBhY2thZ2VzIGFuZCBhcHBzIGNhbiBhZGQgaGFuZGxlcnMgdG8gdGhpcyB2aWEgV2ViQXBwLmNvbm5lY3RIYW5kbGVycy5cbiAgLy8gVGhleSBhcmUgaW5zZXJ0ZWQgYmVmb3JlIG91ciBkZWZhdWx0IGhhbmRsZXIuXG4gIHZhciBwYWNrYWdlQW5kQXBwSGFuZGxlcnMgPSBjb25uZWN0KCk7XG4gIGFwcC51c2UocGFja2FnZUFuZEFwcEhhbmRsZXJzKTtcblxuICB2YXIgc3VwcHJlc3NDb25uZWN0RXJyb3JzID0gZmFsc2U7XG4gIC8vIGNvbm5lY3Qga25vd3MgaXQgaXMgYW4gZXJyb3IgaGFuZGxlciBiZWNhdXNlIGl0IGhhcyA0IGFyZ3VtZW50cyBpbnN0ZWFkIG9mXG4gIC8vIDMuIGdvIGZpZ3VyZS4gIChJdCBpcyBub3Qgc21hcnQgZW5vdWdoIHRvIGZpbmQgc3VjaCBhIHRoaW5nIGlmIGl0J3MgaGlkZGVuXG4gIC8vIGluc2lkZSBwYWNrYWdlQW5kQXBwSGFuZGxlcnMuKVxuICBhcHAudXNlKGZ1bmN0aW9uKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgICBpZiAoIWVyciB8fCAhc3VwcHJlc3NDb25uZWN0RXJyb3JzIHx8ICFyZXEuaGVhZGVyc1sneC1zdXBwcmVzcy1lcnJvciddKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJlcy53cml0ZUhlYWQoZXJyLnN0YXR1cywgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuICAgIHJlcy5lbmQoJ0FuIGVycm9yIG1lc3NhZ2UnKTtcbiAgfSk7XG5cbiAgYXBwLnVzZShhc3luYyBmdW5jdGlvbihyZXEsIHJlcywgbmV4dCkge1xuICAgIGlmICghYXBwVXJsKHJlcS51cmwpKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICByZXEubWV0aG9kICE9PSAnSEVBRCcgJiZcbiAgICAgIHJlcS5tZXRob2QgIT09ICdHRVQnICYmXG4gICAgICAhTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy53ZWJhcHA/LmFsd2F5c1JldHVybkNvbnRlbnRcbiAgICApIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IHJlcS5tZXRob2QgPT09ICdPUFRJT05TJyA/IDIwMCA6IDQwNTtcbiAgICAgIHJlcy53cml0ZUhlYWQoc3RhdHVzLCB7XG4gICAgICAgIEFsbG93OiAnT1BUSU9OUywgR0VULCBIRUFEJyxcbiAgICAgICAgJ0NvbnRlbnQtTGVuZ3RoJzogJzAnLFxuICAgICAgfSk7XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBoZWFkZXJzID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvaHRtbDsgY2hhcnNldD11dGYtOCcsXG4gICAgICB9O1xuXG4gICAgICBpZiAoc2h1dHRpbmdEb3duKSB7XG4gICAgICAgIGhlYWRlcnNbJ0Nvbm5lY3Rpb24nXSA9ICdDbG9zZSc7XG4gICAgICB9XG5cbiAgICAgIHZhciByZXF1ZXN0ID0gV2ViQXBwLmNhdGVnb3JpemVSZXF1ZXN0KHJlcSk7XG5cbiAgICAgIGlmIChyZXF1ZXN0LnVybC5xdWVyeSAmJiByZXF1ZXN0LnVybC5xdWVyeVsnbWV0ZW9yX2Nzc19yZXNvdXJjZSddKSB7XG4gICAgICAgIC8vIEluIHRoaXMgY2FzZSwgd2UncmUgcmVxdWVzdGluZyBhIENTUyByZXNvdXJjZSBpbiB0aGUgbWV0ZW9yLXNwZWNpZmljXG4gICAgICAgIC8vIHdheSwgYnV0IHdlIGRvbid0IGhhdmUgaXQuICBTZXJ2ZSBhIHN0YXRpYyBjc3MgZmlsZSB0aGF0IGluZGljYXRlcyB0aGF0XG4gICAgICAgIC8vIHdlIGRpZG4ndCBoYXZlIGl0LCBzbyB3ZSBjYW4gZGV0ZWN0IHRoYXQgYW5kIHJlZnJlc2guICBNYWtlIHN1cmVcbiAgICAgICAgLy8gdGhhdCBhbnkgcHJveGllcyBvciBDRE5zIGRvbid0IGNhY2hlIHRoaXMgZXJyb3IhICAoTm9ybWFsbHkgcHJveGllc1xuICAgICAgICAvLyBvciBDRE5zIGFyZSBzbWFydCBlbm91Z2ggbm90IHRvIGNhY2hlIGVycm9yIHBhZ2VzLCBidXQgaW4gb3JkZXIgdG9cbiAgICAgICAgLy8gbWFrZSB0aGlzIGhhY2sgd29yaywgd2UgbmVlZCB0byByZXR1cm4gdGhlIENTUyBmaWxlIGFzIGEgMjAwLCB3aGljaFxuICAgICAgICAvLyB3b3VsZCBvdGhlcndpc2UgYmUgY2FjaGVkLilcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAndGV4dC9jc3M7IGNoYXJzZXQ9dXRmLTgnO1xuICAgICAgICBoZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgaGVhZGVycyk7XG4gICAgICAgIHJlcy53cml0ZSgnLm1ldGVvci1jc3Mtbm90LWZvdW5kLWVycm9yIHsgd2lkdGg6IDBweDt9Jyk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC51cmwucXVlcnkgJiYgcmVxdWVzdC51cmwucXVlcnlbJ21ldGVvcl9qc19yZXNvdXJjZSddKSB7XG4gICAgICAgIC8vIFNpbWlsYXJseSwgd2UncmUgcmVxdWVzdGluZyBhIEpTIHJlc291cmNlIHRoYXQgd2UgZG9uJ3QgaGF2ZS5cbiAgICAgICAgLy8gU2VydmUgYW4gdW5jYWNoZWQgNDA0LiAoV2UgY2FuJ3QgdXNlIHRoZSBzYW1lIGhhY2sgd2UgdXNlIGZvciBDU1MsXG4gICAgICAgIC8vIGJlY2F1c2UgYWN0dWFsbHkgYWN0aW5nIG9uIHRoYXQgaGFjayByZXF1aXJlcyB1cyB0byBoYXZlIHRoZSBKU1xuICAgICAgICAvLyBhbHJlYWR5ISlcbiAgICAgICAgaGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ25vLWNhY2hlJztcbiAgICAgICAgcmVzLndyaXRlSGVhZCg0MDQsIGhlYWRlcnMpO1xuICAgICAgICByZXMuZW5kKCc0MDQgTm90IEZvdW5kJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudXJsLnF1ZXJ5ICYmIHJlcXVlc3QudXJsLnF1ZXJ5WydtZXRlb3JfZG9udF9zZXJ2ZV9pbmRleCddKSB7XG4gICAgICAgIC8vIFdoZW4gZG93bmxvYWRpbmcgZmlsZXMgZHVyaW5nIGEgQ29yZG92YSBob3QgY29kZSBwdXNoLCB3ZSBuZWVkXG4gICAgICAgIC8vIHRvIGRldGVjdCBpZiBhIGZpbGUgaXMgbm90IGF2YWlsYWJsZSBpbnN0ZWFkIG9mIGluYWR2ZXJ0ZW50bHlcbiAgICAgICAgLy8gZG93bmxvYWRpbmcgdGhlIGRlZmF1bHQgaW5kZXggcGFnZS5cbiAgICAgICAgLy8gU28gc2ltaWxhciB0byB0aGUgc2l0dWF0aW9uIGFib3ZlLCB3ZSBzZXJ2ZSBhbiB1bmNhY2hlZCA0MDQuXG4gICAgICAgIGhlYWRlcnNbJ0NhY2hlLUNvbnRyb2wnXSA9ICduby1jYWNoZSc7XG4gICAgICAgIHJlcy53cml0ZUhlYWQoNDA0LCBoZWFkZXJzKTtcbiAgICAgICAgcmVzLmVuZCgnNDA0IE5vdCBGb3VuZCcpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHsgYXJjaCB9ID0gcmVxdWVzdDtcbiAgICAgIGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYXJjaCwgJ3N0cmluZycsIHsgYXJjaCB9KTtcblxuICAgICAgaWYgKCFoYXNPd24uY2FsbChXZWJBcHAuY2xpZW50UHJvZ3JhbXMsIGFyY2gpKSB7XG4gICAgICAgIC8vIFdlIGNvdWxkIGNvbWUgaGVyZSBpbiBjYXNlIHdlIHJ1biB3aXRoIHNvbWUgYXJjaGl0ZWN0dXJlcyBleGNsdWRlZFxuICAgICAgICBoZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuICAgICAgICByZXMud3JpdGVIZWFkKDQwNCwgaGVhZGVycyk7XG4gICAgICAgIGlmIChNZXRlb3IuaXNEZXZlbG9wbWVudCkge1xuICAgICAgICAgIHJlcy5lbmQoYE5vIGNsaWVudCBwcm9ncmFtIGZvdW5kIGZvciB0aGUgJHthcmNofSBhcmNoaXRlY3R1cmUuYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU2FmZXR5IG5ldCwgYnV0IHRoaXMgYnJhbmNoIHNob3VsZCBub3QgYmUgcG9zc2libGUuXG4gICAgICAgICAgcmVzLmVuZCgnNDA0IE5vdCBGb3VuZCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgcGF1c2VDbGllbnQoYXJjaCkgaGFzIGJlZW4gY2FsbGVkLCBwcm9ncmFtLnBhdXNlZCB3aWxsIGJlIGFcbiAgICAgIC8vIFByb21pc2UgdGhhdCB3aWxsIGJlIHJlc29sdmVkIHdoZW4gdGhlIHByb2dyYW0gaXMgdW5wYXVzZWQuXG4gICAgICBhd2FpdCBXZWJBcHAuY2xpZW50UHJvZ3JhbXNbYXJjaF0ucGF1c2VkO1xuXG4gICAgICByZXR1cm4gZ2V0Qm9pbGVycGxhdGVBc3luYyhyZXF1ZXN0LCBhcmNoKVxuICAgICAgICAudGhlbigoeyBzdHJlYW0sIHN0YXR1c0NvZGUsIGhlYWRlcnM6IG5ld0hlYWRlcnMgfSkgPT4ge1xuICAgICAgICAgIGlmICghc3RhdHVzQ29kZSkge1xuICAgICAgICAgICAgc3RhdHVzQ29kZSA9IHJlcy5zdGF0dXNDb2RlID8gcmVzLnN0YXR1c0NvZGUgOiAyMDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5ld0hlYWRlcnMpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaGVhZGVycywgbmV3SGVhZGVycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzLndyaXRlSGVhZChzdGF0dXNDb2RlLCBoZWFkZXJzKTtcblxuICAgICAgICAgIHN0cmVhbS5waXBlKHJlcywge1xuICAgICAgICAgICAgLy8gRW5kIHRoZSByZXNwb25zZSB3aGVuIHRoZSBzdHJlYW0gZW5kcy5cbiAgICAgICAgICAgIGVuZDogdHJ1ZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBMb2cuZXJyb3IoJ0Vycm9yIHJ1bm5pbmcgdGVtcGxhdGU6ICcgKyBlcnJvci5zdGFjayk7XG4gICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIGhlYWRlcnMpO1xuICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBSZXR1cm4gNDA0IGJ5IGRlZmF1bHQsIGlmIG5vIG90aGVyIGhhbmRsZXJzIHNlcnZlIHRoaXMgVVJMLlxuICBhcHAudXNlKGZ1bmN0aW9uKHJlcSwgcmVzKSB7XG4gICAgcmVzLndyaXRlSGVhZCg0MDQpO1xuICAgIHJlcy5lbmQoKTtcbiAgfSk7XG5cbiAgdmFyIGh0dHBTZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgdmFyIG9uTGlzdGVuaW5nQ2FsbGJhY2tzID0gW107XG5cbiAgLy8gQWZ0ZXIgNSBzZWNvbmRzIHcvbyBkYXRhIG9uIGEgc29ja2V0LCBraWxsIGl0LiAgT24gdGhlIG90aGVyIGhhbmQsIGlmXG4gIC8vIHRoZXJlJ3MgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdCwgZ2l2ZSBpdCBhIGhpZ2hlciB0aW1lb3V0IGluc3RlYWQgKHRvIGF2b2lkXG4gIC8vIGtpbGxpbmcgbG9uZy1wb2xsaW5nIHJlcXVlc3RzKVxuICBodHRwU2VydmVyLnNldFRpbWVvdXQoU0hPUlRfU09DS0VUX1RJTUVPVVQpO1xuXG4gIC8vIERvIHRoaXMgaGVyZSwgYW5kIHRoZW4gYWxzbyBpbiBsaXZlZGF0YS9zdHJlYW1fc2VydmVyLmpzLCBiZWNhdXNlXG4gIC8vIHN0cmVhbV9zZXJ2ZXIuanMga2lsbHMgYWxsIHRoZSBjdXJyZW50IHJlcXVlc3QgaGFuZGxlcnMgd2hlbiBpbnN0YWxsaW5nIGl0c1xuICAvLyBvd24uXG4gIGh0dHBTZXJ2ZXIub24oJ3JlcXVlc3QnLCBXZWJBcHAuX3RpbWVvdXRBZGp1c3RtZW50UmVxdWVzdENhbGxiYWNrKTtcblxuICAvLyBJZiB0aGUgY2xpZW50IGdhdmUgdXMgYSBiYWQgcmVxdWVzdCwgdGVsbCBpdCBpbnN0ZWFkIG9mIGp1c3QgY2xvc2luZyB0aGVcbiAgLy8gc29ja2V0LiBUaGlzIGxldHMgbG9hZCBiYWxhbmNlcnMgaW4gZnJvbnQgb2YgdXMgZGlmZmVyZW50aWF0ZSBiZXR3ZWVuIFwiYVxuICAvLyBzZXJ2ZXIgaXMgcmFuZG9tbHkgY2xvc2luZyBzb2NrZXRzIGZvciBubyByZWFzb25cIiBhbmQgXCJjbGllbnQgc2VudCBhIGJhZFxuICAvLyByZXF1ZXN0XCIuXG4gIC8vXG4gIC8vIFRoaXMgd2lsbCBvbmx5IHdvcmsgb24gTm9kZSA2OyBOb2RlIDQgZGVzdHJveXMgdGhlIHNvY2tldCBiZWZvcmUgY2FsbGluZ1xuICAvLyB0aGlzIGV2ZW50LiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3B1bGwvNDU1Ny8gZm9yIGRldGFpbHMuXG4gIGh0dHBTZXJ2ZXIub24oJ2NsaWVudEVycm9yJywgKGVyciwgc29ja2V0KSA9PiB7XG4gICAgLy8gUHJlLU5vZGUtNiwgZG8gbm90aGluZy5cbiAgICBpZiAoc29ja2V0LmRlc3Ryb3llZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChlcnIubWVzc2FnZSA9PT0gJ1BhcnNlIEVycm9yJykge1xuICAgICAgc29ja2V0LmVuZCgnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0XFxyXFxuXFxyXFxuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvciBvdGhlciBlcnJvcnMsIHVzZSB0aGUgZGVmYXVsdCBiZWhhdmlvciBhcyBpZiB3ZSBoYWQgbm8gY2xpZW50RXJyb3JcbiAgICAgIC8vIGhhbmRsZXIuXG4gICAgICBzb2NrZXQuZGVzdHJveShlcnIpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gc3RhcnQgdXAgYXBwXG4gIF8uZXh0ZW5kKFdlYkFwcCwge1xuICAgIGNvbm5lY3RIYW5kbGVyczogcGFja2FnZUFuZEFwcEhhbmRsZXJzLFxuICAgIHJhd0Nvbm5lY3RIYW5kbGVyczogcmF3Q29ubmVjdEhhbmRsZXJzLFxuICAgIGh0dHBTZXJ2ZXI6IGh0dHBTZXJ2ZXIsXG4gICAgY29ubmVjdEFwcDogYXBwLFxuICAgIC8vIEZvciB0ZXN0aW5nLlxuICAgIHN1cHByZXNzQ29ubmVjdEVycm9yczogZnVuY3Rpb24oKSB7XG4gICAgICBzdXBwcmVzc0Nvbm5lY3RFcnJvcnMgPSB0cnVlO1xuICAgIH0sXG4gICAgb25MaXN0ZW5pbmc6IGZ1bmN0aW9uKGYpIHtcbiAgICAgIGlmIChvbkxpc3RlbmluZ0NhbGxiYWNrcykgb25MaXN0ZW5pbmdDYWxsYmFja3MucHVzaChmKTtcbiAgICAgIGVsc2UgZigpO1xuICAgIH0sXG4gICAgLy8gVGhpcyBjYW4gYmUgb3ZlcnJpZGRlbiBieSB1c2VycyB3aG8gd2FudCB0byBtb2RpZnkgaG93IGxpc3RlbmluZyB3b3Jrc1xuICAgIC8vIChlZywgdG8gcnVuIGEgcHJveHkgbGlrZSBBcG9sbG8gRW5naW5lIFByb3h5IGluIGZyb250IG9mIHRoZSBzZXJ2ZXIpLlxuICAgIHN0YXJ0TGlzdGVuaW5nOiBmdW5jdGlvbihodHRwU2VydmVyLCBsaXN0ZW5PcHRpb25zLCBjYikge1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4obGlzdGVuT3B0aW9ucywgY2IpO1xuICAgIH0sXG4gIH0pO1xuXG4gICAgLyoqXG4gICAqIEBuYW1lIG1haW5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAc3VtbWFyeSBTdGFydHMgdGhlIEhUVFAgc2VydmVyLlxuICAgKiAgSWYgYFVOSVhfU09DS0VUX1BBVEhgIGlzIHByZXNlbnQgTWV0ZW9yJ3MgSFRUUCBzZXJ2ZXIgd2lsbCB1c2UgdGhhdCBzb2NrZXQgZmlsZSBmb3IgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uLCBpbnN0ZWFkIG9mIFRDUC5cbiAgICogSWYgeW91IGNob29zZSB0byBub3QgaW5jbHVkZSB3ZWJhcHAgcGFja2FnZSBpbiB5b3VyIGFwcGxpY2F0aW9uIHRoaXMgbWV0aG9kIHN0aWxsIG11c3QgYmUgZGVmaW5lZCBmb3IgeW91ciBNZXRlb3IgYXBwbGljYXRpb24gdG8gd29yay4gXG4gICAqL1xuICAvLyBMZXQgdGhlIHJlc3Qgb2YgdGhlIHBhY2thZ2VzIChhbmQgTWV0ZW9yLnN0YXJ0dXAgaG9va3MpIGluc2VydCBjb25uZWN0XG4gIC8vIG1pZGRsZXdhcmVzIGFuZCB1cGRhdGUgX19tZXRlb3JfcnVudGltZV9jb25maWdfXywgdGhlbiBrZWVwIGdvaW5nIHRvIHNldCB1cFxuICAvLyBhY3R1YWxseSBzZXJ2aW5nIEhUTUwuXG4gIGV4cG9ydHMubWFpbiA9IGFyZ3YgPT4ge1xuICAgIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG5cbiAgICBjb25zdCBzdGFydEh0dHBTZXJ2ZXIgPSBsaXN0ZW5PcHRpb25zID0+IHtcbiAgICAgIFdlYkFwcC5zdGFydExpc3RlbmluZyhcbiAgICAgICAgaHR0cFNlcnZlcixcbiAgICAgICAgbGlzdGVuT3B0aW9ucyxcbiAgICAgICAgTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChcbiAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTUVURU9SX1BSSU5UX09OX0xJU1RFTikge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTElTVEVOSU5HJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjYWxsYmFja3MgPSBvbkxpc3RlbmluZ0NhbGxiYWNrcztcbiAgICAgICAgICAgIG9uTGlzdGVuaW5nQ2FsbGJhY2tzID0gbnVsbDtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5mb3JFYWNoKGNhbGxiYWNrID0+IHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsaXN0ZW5pbmc6JywgZSk7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUgJiYgZS5zdGFjayk7XG4gICAgICAgICAgfVxuICAgICAgICApXG4gICAgICApO1xuICAgIH07XG5cbiAgICBsZXQgbG9jYWxQb3J0ID0gcHJvY2Vzcy5lbnYuUE9SVCB8fCAwO1xuICAgIGxldCB1bml4U29ja2V0UGF0aCA9IHByb2Nlc3MuZW52LlVOSVhfU09DS0VUX1BBVEg7XG5cbiAgICBpZiAodW5peFNvY2tldFBhdGgpIHtcbiAgICAgIGlmIChjbHVzdGVyLmlzV29ya2VyKSB7XG4gICAgICAgIGNvbnN0IHdvcmtlck5hbWUgPSBjbHVzdGVyLndvcmtlci5wcm9jZXNzLmVudi5uYW1lIHx8IGNsdXN0ZXIud29ya2VyLmlkO1xuICAgICAgICB1bml4U29ja2V0UGF0aCArPSAnLicgKyB3b3JrZXJOYW1lICsgJy5zb2NrJztcbiAgICAgIH1cbiAgICAgIC8vIFN0YXJ0IHRoZSBIVFRQIHNlcnZlciB1c2luZyBhIHNvY2tldCBmaWxlLlxuICAgICAgcmVtb3ZlRXhpc3RpbmdTb2NrZXRGaWxlKHVuaXhTb2NrZXRQYXRoKTtcbiAgICAgIHN0YXJ0SHR0cFNlcnZlcih7IHBhdGg6IHVuaXhTb2NrZXRQYXRoIH0pO1xuXG4gICAgICBjb25zdCB1bml4U29ja2V0UGVybWlzc2lvbnMgPSAoXG4gICAgICAgIHByb2Nlc3MuZW52LlVOSVhfU09DS0VUX1BFUk1JU1NJT05TIHx8ICcnXG4gICAgICApLnRyaW0oKTtcbiAgICAgIGlmICh1bml4U29ja2V0UGVybWlzc2lvbnMpIHtcbiAgICAgICAgaWYgKC9eWzAtN117M30kLy50ZXN0KHVuaXhTb2NrZXRQZXJtaXNzaW9ucykpIHtcbiAgICAgICAgICBjaG1vZFN5bmModW5peFNvY2tldFBhdGgsIHBhcnNlSW50KHVuaXhTb2NrZXRQZXJtaXNzaW9ucywgOCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBVTklYX1NPQ0tFVF9QRVJNSVNTSU9OUyBzcGVjaWZpZWQnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB1bml4U29ja2V0R3JvdXAgPSAocHJvY2Vzcy5lbnYuVU5JWF9TT0NLRVRfR1JPVVAgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmICh1bml4U29ja2V0R3JvdXApIHtcbiAgICAgICAgLy93aG9tc3QgYXV0b21hdGljYWxseSBoYW5kbGVzIGJvdGggZ3JvdXAgbmFtZXMgYW5kIG51bWVyaWNhbCBnaWRzXG4gICAgICAgIGNvbnN0IHVuaXhTb2NrZXRHcm91cEluZm8gPSB3aG9tc3Quc3luYy5ncm91cCh1bml4U29ja2V0R3JvdXApO1xuICAgICAgICBpZiAodW5peFNvY2tldEdyb3VwSW5mbyA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBVTklYX1NPQ0tFVF9HUk9VUCBuYW1lIHNwZWNpZmllZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNob3duU3luYyh1bml4U29ja2V0UGF0aCwgdXNlckluZm8oKS51aWQsIHVuaXhTb2NrZXRHcm91cEluZm8uZ2lkKTtcbiAgICAgIH1cblxuICAgICAgcmVnaXN0ZXJTb2NrZXRGaWxlQ2xlYW51cCh1bml4U29ja2V0UGF0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvY2FsUG9ydCA9IGlzTmFOKE51bWJlcihsb2NhbFBvcnQpKSA/IGxvY2FsUG9ydCA6IE51bWJlcihsb2NhbFBvcnQpO1xuICAgICAgaWYgKC9cXFxcXFxcXD8uK1xcXFxwaXBlXFxcXD8uKy8udGVzdChsb2NhbFBvcnQpKSB7XG4gICAgICAgIC8vIFN0YXJ0IHRoZSBIVFRQIHNlcnZlciB1c2luZyBXaW5kb3dzIFNlcnZlciBzdHlsZSBuYW1lZCBwaXBlLlxuICAgICAgICBzdGFydEh0dHBTZXJ2ZXIoeyBwYXRoOiBsb2NhbFBvcnQgfSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhbFBvcnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgIC8vIFN0YXJ0IHRoZSBIVFRQIHNlcnZlciB1c2luZyBUQ1AuXG4gICAgICAgIHN0YXJ0SHR0cFNlcnZlcih7XG4gICAgICAgICAgcG9ydDogbG9jYWxQb3J0LFxuICAgICAgICAgIGhvc3Q6IHByb2Nlc3MuZW52LkJJTkRfSVAgfHwgJzAuMC4wLjAnLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBQT1JUIHNwZWNpZmllZCcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiAnREFFTU9OJztcbiAgfTtcbn1cblxudmFyIGlubGluZVNjcmlwdHNBbGxvd2VkID0gdHJ1ZTtcblxuV2ViQXBwSW50ZXJuYWxzLmlubGluZVNjcmlwdHNBbGxvd2VkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBpbmxpbmVTY3JpcHRzQWxsb3dlZDtcbn07XG5cbldlYkFwcEludGVybmFscy5zZXRJbmxpbmVTY3JpcHRzQWxsb3dlZCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIGlubGluZVNjcmlwdHNBbGxvd2VkID0gdmFsdWU7XG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG52YXIgc3JpTW9kZTtcblxuV2ViQXBwSW50ZXJuYWxzLmVuYWJsZVN1YnJlc291cmNlSW50ZWdyaXR5ID0gZnVuY3Rpb24odXNlX2NyZWRlbnRpYWxzID0gZmFsc2UpIHtcbiAgc3JpTW9kZSA9IHVzZV9jcmVkZW50aWFscyA/ICd1c2UtY3JlZGVudGlhbHMnIDogJ2Fub255bW91cyc7XG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuc2V0QnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2sgPSBmdW5jdGlvbihob29rRm4pIHtcbiAgYnVuZGxlZEpzQ3NzVXJsUmV3cml0ZUhvb2sgPSBob29rRm47XG4gIFdlYkFwcEludGVybmFscy5nZW5lcmF0ZUJvaWxlcnBsYXRlKCk7XG59O1xuXG5XZWJBcHBJbnRlcm5hbHMuc2V0QnVuZGxlZEpzQ3NzUHJlZml4ID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5zZXRCdW5kbGVkSnNDc3NVcmxSZXdyaXRlSG9vayhmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gcHJlZml4ICsgdXJsO1xuICB9KTtcbn07XG5cbi8vIFBhY2thZ2VzIGNhbiBjYWxsIGBXZWJBcHBJbnRlcm5hbHMuYWRkU3RhdGljSnNgIHRvIHNwZWNpZnkgc3RhdGljXG4vLyBKYXZhU2NyaXB0IHRvIGJlIGluY2x1ZGVkIGluIHRoZSBhcHAuIFRoaXMgc3RhdGljIEpTIHdpbGwgYmUgaW5saW5lZCxcbi8vIHVubGVzcyBpbmxpbmUgc2NyaXB0cyBoYXZlIGJlZW4gZGlzYWJsZWQsIGluIHdoaWNoIGNhc2UgaXQgd2lsbCBiZVxuLy8gc2VydmVkIHVuZGVyIGAvPHNoYTEgb2YgY29udGVudHM+YC5cbnZhciBhZGRpdGlvbmFsU3RhdGljSnMgPSB7fTtcbldlYkFwcEludGVybmFscy5hZGRTdGF0aWNKcyA9IGZ1bmN0aW9uKGNvbnRlbnRzKSB7XG4gIGFkZGl0aW9uYWxTdGF0aWNKc1snLycgKyBzaGExKGNvbnRlbnRzKSArICcuanMnXSA9IGNvbnRlbnRzO1xufTtcblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RzXG5XZWJBcHBJbnRlcm5hbHMuZ2V0Qm9pbGVycGxhdGUgPSBnZXRCb2lsZXJwbGF0ZTtcbldlYkFwcEludGVybmFscy5hZGRpdGlvbmFsU3RhdGljSnMgPSBhZGRpdGlvbmFsU3RhdGljSnM7XG5cbi8vIFN0YXJ0IHRoZSBzZXJ2ZXIhXG5ydW5XZWJBcHBTZXJ2ZXIoKTtcbiIsImltcG9ydCBucG1Db25uZWN0IGZyb20gXCJjb25uZWN0XCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0KC4uLmNvbm5lY3RBcmdzKSB7XG4gIGNvbnN0IGhhbmRsZXJzID0gbnBtQ29ubmVjdC5hcHBseSh0aGlzLCBjb25uZWN0QXJncyk7XG4gIGNvbnN0IG9yaWdpbmFsVXNlID0gaGFuZGxlcnMudXNlO1xuXG4gIC8vIFdyYXAgdGhlIGhhbmRsZXJzLnVzZSBtZXRob2Qgc28gdGhhdCBhbnkgcHJvdmlkZWQgaGFuZGxlciBmdW5jdGlvbnNcbiAgLy8gYWx3YXlzIHJ1biBpbiBhIEZpYmVyLlxuICBoYW5kbGVycy51c2UgPSBmdW5jdGlvbiB1c2UoLi4udXNlQXJncykge1xuICAgIGNvbnN0IHsgc3RhY2sgfSA9IHRoaXM7XG4gICAgY29uc3Qgb3JpZ2luYWxMZW5ndGggPSBzdGFjay5sZW5ndGg7XG4gICAgY29uc3QgcmVzdWx0ID0gb3JpZ2luYWxVc2UuYXBwbHkodGhpcywgdXNlQXJncyk7XG5cbiAgICAvLyBJZiB3ZSBqdXN0IGFkZGVkIGFueXRoaW5nIHRvIHRoZSBzdGFjaywgd3JhcCBlYWNoIG5ldyBlbnRyeS5oYW5kbGVcbiAgICAvLyB3aXRoIGEgZnVuY3Rpb24gdGhhdCBjYWxscyBQcm9taXNlLmFzeW5jQXBwbHkgdG8gZW5zdXJlIHRoZVxuICAgIC8vIG9yaWdpbmFsIGhhbmRsZXIgcnVucyBpbiBhIEZpYmVyLlxuICAgIGZvciAobGV0IGkgPSBvcmlnaW5hbExlbmd0aDsgaSA8IHN0YWNrLmxlbmd0aDsgKytpKSB7XG4gICAgICBjb25zdCBlbnRyeSA9IHN0YWNrW2ldO1xuICAgICAgY29uc3Qgb3JpZ2luYWxIYW5kbGUgPSBlbnRyeS5oYW5kbGU7XG5cbiAgICAgIGlmIChvcmlnaW5hbEhhbmRsZS5sZW5ndGggPj0gNCkge1xuICAgICAgICAvLyBJZiB0aGUgb3JpZ2luYWwgaGFuZGxlIGhhZCBmb3VyIChvciBtb3JlKSBwYXJhbWV0ZXJzLCB0aGVcbiAgICAgICAgLy8gd3JhcHBlciBtdXN0IGFsc28gaGF2ZSBmb3VyIHBhcmFtZXRlcnMsIHNpbmNlIGNvbm5lY3QgdXNlc1xuICAgICAgICAvLyBoYW5kbGUubGVuZ3RoIHRvIGRldGVybWluZSB3aGV0aGVyIHRvIHBhc3MgdGhlIGVycm9yIGFzIHRoZSBmaXJzdFxuICAgICAgICAvLyBhcmd1bWVudCB0byB0aGUgaGFuZGxlIGZ1bmN0aW9uLlxuICAgICAgICBlbnRyeS5oYW5kbGUgPSBmdW5jdGlvbiBoYW5kbGUoZXJyLCByZXEsIHJlcywgbmV4dCkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFzeW5jQXBwbHkob3JpZ2luYWxIYW5kbGUsIHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbnRyeS5oYW5kbGUgPSBmdW5jdGlvbiBoYW5kbGUocmVxLCByZXMsIG5leHQpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hc3luY0FwcGx5KG9yaWdpbmFsSGFuZGxlLCB0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgcmV0dXJuIGhhbmRsZXJzO1xufVxuIiwiaW1wb3J0IHsgc3RhdFN5bmMsIHVubGlua1N5bmMsIGV4aXN0c1N5bmMgfSBmcm9tICdmcyc7XG5cbi8vIFNpbmNlIGEgbmV3IHNvY2tldCBmaWxlIHdpbGwgYmUgY3JlYXRlZCB3aGVuIHRoZSBIVFRQIHNlcnZlclxuLy8gc3RhcnRzIHVwLCBpZiBmb3VuZCByZW1vdmUgdGhlIGV4aXN0aW5nIGZpbGUuXG4vL1xuLy8gV0FSTklORzpcbi8vIFRoaXMgd2lsbCByZW1vdmUgdGhlIGNvbmZpZ3VyZWQgc29ja2V0IGZpbGUgd2l0aG91dCB3YXJuaW5nLiBJZlxuLy8gdGhlIGNvbmZpZ3VyZWQgc29ja2V0IGZpbGUgaXMgYWxyZWFkeSBpbiB1c2UgYnkgYW5vdGhlciBhcHBsaWNhdGlvbixcbi8vIGl0IHdpbGwgc3RpbGwgYmUgcmVtb3ZlZC4gTm9kZSBkb2VzIG5vdCBwcm92aWRlIGEgcmVsaWFibGUgd2F5IHRvXG4vLyBkaWZmZXJlbnRpYXRlIGJldHdlZW4gYSBzb2NrZXQgZmlsZSB0aGF0IGlzIGFscmVhZHkgaW4gdXNlIGJ5XG4vLyBhbm90aGVyIGFwcGxpY2F0aW9uIG9yIGEgc3RhbGUgc29ja2V0IGZpbGUgdGhhdCBoYXMgYmVlblxuLy8gbGVmdCBvdmVyIGFmdGVyIGEgU0lHS0lMTC4gU2luY2Ugd2UgaGF2ZSBubyByZWxpYWJsZSB3YXkgdG9cbi8vIGRpZmZlcmVudGlhdGUgYmV0d2VlbiB0aGVzZSB0d28gc2NlbmFyaW9zLCB0aGUgYmVzdCBjb3Vyc2Ugb2Zcbi8vIGFjdGlvbiBkdXJpbmcgc3RhcnR1cCBpcyB0byByZW1vdmUgYW55IGV4aXN0aW5nIHNvY2tldCBmaWxlLiBUaGlzXG4vLyBpcyBub3QgdGhlIHNhZmVzdCBjb3Vyc2Ugb2YgYWN0aW9uIGFzIHJlbW92aW5nIHRoZSBleGlzdGluZyBzb2NrZXRcbi8vIGZpbGUgY291bGQgaW1wYWN0IGFuIGFwcGxpY2F0aW9uIHVzaW5nIGl0LCBidXQgdGhpcyBhcHByb2FjaCBoZWxwc1xuLy8gZW5zdXJlIHRoZSBIVFRQIHNlcnZlciBjYW4gc3RhcnR1cCB3aXRob3V0IG1hbnVhbFxuLy8gaW50ZXJ2ZW50aW9uIChlLmcuIGFza2luZyBmb3IgdGhlIHZlcmlmaWNhdGlvbiBhbmQgY2xlYW51cCBvZiBzb2NrZXRcbi8vIGZpbGVzIGJlZm9yZSBhbGxvd2luZyB0aGUgSFRUUCBzZXJ2ZXIgdG8gYmUgc3RhcnRlZCkuXG4vL1xuLy8gVGhlIGFib3ZlIGJlaW5nIHNhaWQsIGFzIGxvbmcgYXMgdGhlIHNvY2tldCBmaWxlIHBhdGggaXNcbi8vIGNvbmZpZ3VyZWQgY2FyZWZ1bGx5IHdoZW4gdGhlIGFwcGxpY2F0aW9uIGlzIGRlcGxveWVkIChhbmQgZXh0cmFcbi8vIGNhcmUgaXMgdGFrZW4gdG8gbWFrZSBzdXJlIHRoZSBjb25maWd1cmVkIHBhdGggaXMgdW5pcXVlIGFuZCBkb2Vzbid0XG4vLyBjb25mbGljdCB3aXRoIGFub3RoZXIgc29ja2V0IGZpbGUgcGF0aCksIHRoZW4gdGhlcmUgc2hvdWxkIG5vdCBiZVxuLy8gYW55IGlzc3VlcyB3aXRoIHRoaXMgYXBwcm9hY2guXG5leHBvcnQgY29uc3QgcmVtb3ZlRXhpc3RpbmdTb2NrZXRGaWxlID0gKHNvY2tldFBhdGgpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoc3RhdFN5bmMoc29ja2V0UGF0aCkuaXNTb2NrZXQoKSkge1xuICAgICAgLy8gU2luY2UgYSBuZXcgc29ja2V0IGZpbGUgd2lsbCBiZSBjcmVhdGVkLCByZW1vdmUgdGhlIGV4aXN0aW5nXG4gICAgICAvLyBmaWxlLlxuICAgICAgdW5saW5rU3luYyhzb2NrZXRQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQW4gZXhpc3RpbmcgZmlsZSB3YXMgZm91bmQgYXQgXCIke3NvY2tldFBhdGh9XCIgYW5kIGl0IGlzIG5vdCBgICtcbiAgICAgICAgJ2Egc29ja2V0IGZpbGUuIFBsZWFzZSBjb25maXJtIFBPUlQgaXMgcG9pbnRpbmcgdG8gdmFsaWQgYW5kICcgK1xuICAgICAgICAndW4tdXNlZCBzb2NrZXQgZmlsZSBwYXRoLidcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGV4aXN0aW5nIHNvY2tldCBmaWxlIHRvIGNsZWFudXAsIGdyZWF0LCB3ZSdsbFxuICAgIC8vIGNvbnRpbnVlIG5vcm1hbGx5LiBJZiB0aGUgY2F1Z2h0IGV4Y2VwdGlvbiByZXByZXNlbnRzIGFueSBvdGhlclxuICAgIC8vIGlzc3VlLCByZS10aHJvdy5cbiAgICBpZiAoZXJyb3IuY29kZSAhPT0gJ0VOT0VOVCcpIHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxufTtcblxuLy8gUmVtb3ZlIHRoZSBzb2NrZXQgZmlsZSB3aGVuIGRvbmUgdG8gYXZvaWQgbGVhdmluZyBiZWhpbmQgYSBzdGFsZSBvbmUuXG4vLyBOb3RlIC0gYSBzdGFsZSBzb2NrZXQgZmlsZSBpcyBzdGlsbCBsZWZ0IGJlaGluZCBpZiB0aGUgcnVubmluZyBub2RlXG4vLyBwcm9jZXNzIGlzIGtpbGxlZCB2aWEgc2lnbmFsIDkgLSBTSUdLSUxMLlxuZXhwb3J0IGNvbnN0IHJlZ2lzdGVyU29ja2V0RmlsZUNsZWFudXAgPVxuICAoc29ja2V0UGF0aCwgZXZlbnRFbWl0dGVyID0gcHJvY2VzcykgPT4ge1xuICAgIFsnZXhpdCcsICdTSUdJTlQnLCAnU0lHSFVQJywgJ1NJR1RFUk0nXS5mb3JFYWNoKHNpZ25hbCA9PiB7XG4gICAgICBldmVudEVtaXR0ZXIub24oc2lnbmFsLCBNZXRlb3IuYmluZEVudmlyb25tZW50KCgpID0+IHtcbiAgICAgICAgaWYgKGV4aXN0c1N5bmMoc29ja2V0UGF0aCkpIHtcbiAgICAgICAgICB1bmxpbmtTeW5jKHNvY2tldFBhdGgpO1xuICAgICAgICB9XG4gICAgICB9KSk7XG4gICAgfSk7XG4gIH07XG4iXX0=
