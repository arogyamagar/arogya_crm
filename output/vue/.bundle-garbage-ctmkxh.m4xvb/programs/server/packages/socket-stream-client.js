(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var Retry = Package.retry.Retry;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var options;

var require = meteorInstall({"node_modules":{"meteor":{"socket-stream-client":{"server.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                //
// packages/socket-stream-client/server.js                                                        //
//                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                  //
!function (module1) {
  let setMinimumBrowserVersions;
  module1.link("meteor/modern-browsers", {
    setMinimumBrowserVersions(v) {
      setMinimumBrowserVersions = v;
    }
  }, 0);
  setMinimumBrowserVersions({
    chrome: 16,
    edge: 12,
    firefox: 11,
    ie: 10,
    mobileSafari: [6, 1],
    phantomjs: 2,
    safari: 7,
    electron: [0, 20]
  }, module.id);
  if (process.env.DISABLE_SOCKJS) {
    __meteor_runtime_config__.DISABLE_SOCKJS = process.env.DISABLE_SOCKJS;
  }
}.call(this, module);
////////////////////////////////////////////////////////////////////////////////////////////////////

},"node.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                //
// packages/socket-stream-client/node.js                                                          //
//                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                  //
!function (module1) {
  module1.export({
    ClientStream: () => ClientStream
  });
  let Meteor;
  module1.link("meteor/meteor", {
    Meteor(v) {
      Meteor = v;
    }
  }, 0);
  let toWebsocketUrl;
  module1.link("./urls.js", {
    toWebsocketUrl(v) {
      toWebsocketUrl = v;
    }
  }, 1);
  let StreamClientCommon;
  module1.link("./common.js", {
    StreamClientCommon(v) {
      StreamClientCommon = v;
    }
  }, 2);
  class ClientStream extends StreamClientCommon {
    constructor(endpoint, options) {
      super(options);
      this.client = null; // created in _launchConnection
      this.endpoint = endpoint;
      this.headers = this.options.headers || {};
      this.npmFayeOptions = this.options.npmFayeOptions || {};
      this._initCommon(this.options);

      //// Kickoff!
      this._launchConnection();
    }

    // data is a utf8 string. Data sent while not connected is dropped on
    // the floor, and it is up the user of this API to retransmit lost
    // messages on 'reset'
    send(data) {
      if (this.currentStatus.connected) {
        this.client.send(data);
      }
    }

    // Changes where this connection points
    _changeUrl(url) {
      this.endpoint = url;
    }
    _onConnect(client) {
      if (client !== this.client) {
        // This connection is not from the last call to _launchConnection.
        // But _launchConnection calls _cleanup which closes previous connections.
        // It's our belief that this stifles future 'open' events, but maybe
        // we are wrong?
        throw new Error('Got open from inactive client ' + !!this.client);
      }
      if (this._forcedToDisconnect) {
        // We were asked to disconnect between trying to open the connection and
        // actually opening it. Let's just pretend this never happened.
        this.client.close();
        this.client = null;
        return;
      }
      if (this.currentStatus.connected) {
        // We already have a connection. It must have been the case that we
        // started two parallel connection attempts (because we wanted to
        // 'reconnect now' on a hanging connection and we had no way to cancel the
        // connection attempt.) But this shouldn't happen (similarly to the client
        // !== this.client check above).
        throw new Error('Two parallel connections?');
      }
      this._clearConnectionTimer();

      // update status
      this.currentStatus.status = 'connected';
      this.currentStatus.connected = true;
      this.currentStatus.retryCount = 0;
      this.statusChanged();

      // fire resets. This must come after status change so that clients
      // can call send from within a reset callback.
      this.forEachCallback('reset', callback => {
        callback();
      });
    }
    _cleanup(maybeError) {
      this._clearConnectionTimer();
      if (this.client) {
        var client = this.client;
        this.client = null;
        client.close();
        this.forEachCallback('disconnect', callback => {
          callback(maybeError);
        });
      }
    }
    _clearConnectionTimer() {
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
    }
    _getProxyUrl(targetUrl) {
      // Similar to code in tools/http-helpers.js.
      var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
      var noproxy = process.env.NO_PROXY || process.env.no_proxy || null;
      // if we're going to a secure url, try the https_proxy env variable first.
      if (targetUrl.match(/^wss:/) || targetUrl.match(/^https:/)) {
        proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
      }
      if (targetUrl.indexOf('localhost') != -1 || targetUrl.indexOf('127.0.0.1') != -1) {
        return null;
      }
      if (noproxy) {
        for (let item of noproxy.split(',')) {
          if (targetUrl.indexOf(item.trim().replace(/\*/, '')) !== -1) {
            proxy = null;
          }
        }
      }
      return proxy;
    }
    _launchConnection() {
      var _this = this;
      this._cleanup(); // cleanup the old socket, if there was one.

      // Since server-to-server DDP is still an experimental feature, we only
      // require the module if we actually create a server-to-server
      // connection.
      var FayeWebSocket = Npm.require('faye-websocket');
      var deflate = Npm.require('permessage-deflate');
      var targetUrl = toWebsocketUrl(this.endpoint);
      var fayeOptions = {
        headers: this.headers,
        extensions: [deflate]
      };
      fayeOptions = Object.assign(fayeOptions, this.npmFayeOptions);
      var proxyUrl = this._getProxyUrl(targetUrl);
      if (proxyUrl) {
        fayeOptions.proxy = {
          origin: proxyUrl
        };
      }

      // We would like to specify 'ddp' as the subprotocol here. The npm module we
      // used to use as a client would fail the handshake if we ask for a
      // subprotocol and the server doesn't send one back (and sockjs doesn't).
      // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
      // Faye is erroneous or not.  So for now, we don't specify protocols.
      var subprotocols = [];
      var client = this.client = new FayeWebSocket.Client(targetUrl, subprotocols, fayeOptions);
      this._clearConnectionTimer();
      this.connectionTimer = Meteor.setTimeout(() => {
        this._lostConnection(new this.ConnectionError('DDP connection timed out'));
      }, this.CONNECT_TIMEOUT);
      this.client.on('open', Meteor.bindEnvironment(() => {
        return this._onConnect(client);
      }, 'stream connect callback'));
      var clientOnIfCurrent = (event, description, callback) => {
        this.client.on(event, Meteor.bindEnvironment(function () {
          // Ignore events from any connection we've already cleaned up.
          if (client !== _this.client) return;
          callback(...arguments);
        }, description));
      };
      clientOnIfCurrent('error', 'stream error callback', error => {
        if (!this.options._dontPrintErrors) Meteor._debug('stream error', error.message);

        // Faye's 'error' object is not a JS error (and among other things,
        // doesn't stringify well). Convert it to one.
        this._lostConnection(new this.ConnectionError(error.message));
      });
      clientOnIfCurrent('close', 'stream close callback', () => {
        this._lostConnection();
      });
      clientOnIfCurrent('message', 'stream message callback', message => {
        // Ignore binary frames, where message.data is a Buffer
        if (typeof message.data !== 'string') return;
        this.forEachCallback('message', callback => {
          callback(message.data);
        });
      });
    }
  }
}.call(this, module);
////////////////////////////////////////////////////////////////////////////////////////////////////

},"common.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                //
// packages/socket-stream-client/common.js                                                        //
//                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                  //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
module.export({
  StreamClientCommon: () => StreamClientCommon
});
let Retry;
module.link("meteor/retry", {
  Retry(v) {
    Retry = v;
  }
}, 0);
const forcedReconnectError = new Error("forced reconnect");
class StreamClientCommon {
  constructor(options) {
    this.options = _objectSpread({
      retry: true
    }, options || null);
    this.ConnectionError = options && options.ConnectionError || Error;
  }

  // Register for callbacks.
  on(name, callback) {
    if (name !== 'message' && name !== 'reset' && name !== 'disconnect') throw new Error('unknown event type: ' + name);
    if (!this.eventCallbacks[name]) this.eventCallbacks[name] = [];
    this.eventCallbacks[name].push(callback);
  }
  forEachCallback(name, cb) {
    if (!this.eventCallbacks[name] || !this.eventCallbacks[name].length) {
      return;
    }
    this.eventCallbacks[name].forEach(cb);
  }
  _initCommon(options) {
    options = options || Object.create(null);

    //// Constants

    // how long to wait until we declare the connection attempt
    // failed.
    this.CONNECT_TIMEOUT = options.connectTimeoutMs || 10000;
    this.eventCallbacks = Object.create(null); // name -> [callback]

    this._forcedToDisconnect = false;

    //// Reactive status
    this.currentStatus = {
      status: 'connecting',
      connected: false,
      retryCount: 0
    };
    if (Package.tracker) {
      this.statusListeners = new Package.tracker.Tracker.Dependency();
    }
    this.statusChanged = () => {
      if (this.statusListeners) {
        this.statusListeners.changed();
      }
    };

    //// Retry logic
    this._retry = new Retry();
    this.connectionTimer = null;
  }

  // Trigger a reconnect.
  reconnect(options) {
    options = options || Object.create(null);
    if (options.url) {
      this._changeUrl(options.url);
    }
    if (options._sockjsOptions) {
      this.options._sockjsOptions = options._sockjsOptions;
    }
    if (this.currentStatus.connected) {
      if (options._force || options.url) {
        this._lostConnection(forcedReconnectError);
      }
      return;
    }

    // if we're mid-connection, stop it.
    if (this.currentStatus.status === 'connecting') {
      // Pretend it's a clean close.
      this._lostConnection();
    }
    this._retry.clear();
    this.currentStatus.retryCount -= 1; // don't count manual retries
    this._retryNow();
  }
  disconnect(options) {
    options = options || Object.create(null);

    // Failed is permanent. If we're failed, don't let people go back
    // online by calling 'disconnect' then 'reconnect'.
    if (this._forcedToDisconnect) return;

    // If _permanent is set, permanently disconnect a stream. Once a stream
    // is forced to disconnect, it can never reconnect. This is for
    // error cases such as ddp version mismatch, where trying again
    // won't fix the problem.
    if (options._permanent) {
      this._forcedToDisconnect = true;
    }
    this._cleanup();
    this._retry.clear();
    this.currentStatus = {
      status: options._permanent ? 'failed' : 'offline',
      connected: false,
      retryCount: 0
    };
    if (options._permanent && options._error) this.currentStatus.reason = options._error;
    this.statusChanged();
  }

  // maybeError is set unless it's a clean protocol-level close.
  _lostConnection(maybeError) {
    this._cleanup(maybeError);
    this._retryLater(maybeError); // sets status. no need to do it here.
  }

  // fired when we detect that we've gone online. try to reconnect
  // immediately.
  _online() {
    // if we've requested to be offline by disconnecting, don't reconnect.
    if (this.currentStatus.status != 'offline') this.reconnect();
  }
  _retryLater(maybeError) {
    var timeout = 0;
    if (this.options.retry || maybeError === forcedReconnectError) {
      timeout = this._retry.retryLater(this.currentStatus.retryCount, this._retryNow.bind(this));
      this.currentStatus.status = 'waiting';
      this.currentStatus.retryTime = new Date().getTime() + timeout;
    } else {
      this.currentStatus.status = 'failed';
      delete this.currentStatus.retryTime;
    }
    this.currentStatus.connected = false;
    this.statusChanged();
  }
  _retryNow() {
    if (this._forcedToDisconnect) return;
    this.currentStatus.retryCount += 1;
    this.currentStatus.status = 'connecting';
    this.currentStatus.connected = false;
    delete this.currentStatus.retryTime;
    this.statusChanged();
    this._launchConnection();
  }

  // Get current status. Reactive.
  status() {
    if (this.statusListeners) {
      this.statusListeners.depend();
    }
    return this.currentStatus;
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////

},"urls.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                //
// packages/socket-stream-client/urls.js                                                          //
//                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                  //
module.export({
  toSockjsUrl: () => toSockjsUrl,
  toWebsocketUrl: () => toWebsocketUrl
});
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
// @param url {String} URL to Meteor app, eg:
//   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
//   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
// @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.
// for scheme "http" and subPath "sockjs"
//   "http://subdomain.meteor.com/sockjs" or "/sockjs"
//   or "https://ddp--1234-foo.meteor.com/sockjs"
function translateUrl(url, newSchemeBase, subPath) {
  if (!newSchemeBase) {
    newSchemeBase = 'http';
  }
  if (subPath !== "sockjs" && url.startsWith("/")) {
    url = Meteor.absoluteUrl(url.substr(1));
  }
  var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
  var httpUrlMatch = url.match(/^http(s?):\/\//);
  var newScheme;
  if (ddpUrlMatch) {
    // Remove scheme and split off the host.
    var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
    newScheme = ddpUrlMatch[1] === 'i' ? newSchemeBase : newSchemeBase + 's';
    var slashPos = urlAfterDDP.indexOf('/');
    var host = slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
    var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

    // In the host (ONLY!), change '*' characters into random digits. This
    // allows different stream connections to connect to different hostnames
    // and avoid browser per-hostname connection limits.
    host = host.replace(/\*/g, () => Math.floor(Math.random() * 10));
    return newScheme + '://' + host + rest;
  } else if (httpUrlMatch) {
    newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + 's';
    var urlAfterHttp = url.substr(httpUrlMatch[0].length);
    url = newScheme + '://' + urlAfterHttp;
  }

  // Prefix FQDNs but not relative URLs
  if (url.indexOf('://') === -1 && !url.startsWith('/')) {
    url = newSchemeBase + '://' + url;
  }

  // XXX This is not what we should be doing: if I have a site
  // deployed at "/foo", then DDP.connect("/") should actually connect
  // to "/", not to "/foo". "/" is an absolute path. (Contrast: if
  // deployed at "/foo", it would be reasonable for DDP.connect("bar")
  // to connect to "/foo/bar").
  //
  // We should make this properly honor absolute paths rather than
  // forcing the path to be relative to the site root. Simultaneously,
  // we should set DDP_DEFAULT_CONNECTION_URL to include the site
  // root. See also client_convenience.js #RationalizingRelativeDDPURLs
  url = Meteor._relativeToSiteRootUrl(url);
  if (url.endsWith('/')) return url + subPath;else return url + '/' + subPath;
}
function toSockjsUrl(url) {
  return translateUrl(url, 'http', 'sockjs');
}
function toWebsocketUrl(url) {
  return translateUrl(url, 'ws', 'websocket');
}
////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/socket-stream-client/server.js");

/* Exports */
Package._define("socket-stream-client");

})();

//# sourceURL=meteor://💻app/packages/socket-stream-client.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvc29ja2V0LXN0cmVhbS1jbGllbnQvc2VydmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9zb2NrZXQtc3RyZWFtLWNsaWVudC9ub2RlLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9zb2NrZXQtc3RyZWFtLWNsaWVudC9jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL3NvY2tldC1zdHJlYW0tY2xpZW50L3VybHMuanMiXSwibmFtZXMiOlsic2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyIsIm1vZHVsZTEiLCJsaW5rIiwidiIsImNocm9tZSIsImVkZ2UiLCJmaXJlZm94IiwiaWUiLCJtb2JpbGVTYWZhcmkiLCJwaGFudG9tanMiLCJzYWZhcmkiLCJlbGVjdHJvbiIsIm1vZHVsZSIsImlkIiwicHJvY2VzcyIsImVudiIsIkRJU0FCTEVfU09DS0pTIiwiX19tZXRlb3JfcnVudGltZV9jb25maWdfXyIsImV4cG9ydCIsIkNsaWVudFN0cmVhbSIsIk1ldGVvciIsInRvV2Vic29ja2V0VXJsIiwiU3RyZWFtQ2xpZW50Q29tbW9uIiwiY29uc3RydWN0b3IiLCJlbmRwb2ludCIsIm9wdGlvbnMiLCJjbGllbnQiLCJoZWFkZXJzIiwibnBtRmF5ZU9wdGlvbnMiLCJfaW5pdENvbW1vbiIsIl9sYXVuY2hDb25uZWN0aW9uIiwic2VuZCIsImRhdGEiLCJjdXJyZW50U3RhdHVzIiwiY29ubmVjdGVkIiwiX2NoYW5nZVVybCIsInVybCIsIl9vbkNvbm5lY3QiLCJFcnJvciIsIl9mb3JjZWRUb0Rpc2Nvbm5lY3QiLCJjbG9zZSIsIl9jbGVhckNvbm5lY3Rpb25UaW1lciIsInN0YXR1cyIsInJldHJ5Q291bnQiLCJzdGF0dXNDaGFuZ2VkIiwiZm9yRWFjaENhbGxiYWNrIiwiY2FsbGJhY2siLCJfY2xlYW51cCIsIm1heWJlRXJyb3IiLCJjb25uZWN0aW9uVGltZXIiLCJjbGVhclRpbWVvdXQiLCJfZ2V0UHJveHlVcmwiLCJ0YXJnZXRVcmwiLCJwcm94eSIsIkhUVFBfUFJPWFkiLCJodHRwX3Byb3h5Iiwibm9wcm94eSIsIk5PX1BST1hZIiwibm9fcHJveHkiLCJtYXRjaCIsIkhUVFBTX1BST1hZIiwiaHR0cHNfcHJveHkiLCJpbmRleE9mIiwiaXRlbSIsInNwbGl0IiwidHJpbSIsInJlcGxhY2UiLCJGYXllV2ViU29ja2V0IiwiTnBtIiwicmVxdWlyZSIsImRlZmxhdGUiLCJmYXllT3B0aW9ucyIsImV4dGVuc2lvbnMiLCJPYmplY3QiLCJhc3NpZ24iLCJwcm94eVVybCIsIm9yaWdpbiIsInN1YnByb3RvY29scyIsIkNsaWVudCIsInNldFRpbWVvdXQiLCJfbG9zdENvbm5lY3Rpb24iLCJDb25uZWN0aW9uRXJyb3IiLCJDT05ORUNUX1RJTUVPVVQiLCJvbiIsImJpbmRFbnZpcm9ubWVudCIsImNsaWVudE9uSWZDdXJyZW50IiwiZXZlbnQiLCJkZXNjcmlwdGlvbiIsImVycm9yIiwiX2RvbnRQcmludEVycm9ycyIsIl9kZWJ1ZyIsIm1lc3NhZ2UiLCJfb2JqZWN0U3ByZWFkIiwiZGVmYXVsdCIsIlJldHJ5IiwiZm9yY2VkUmVjb25uZWN0RXJyb3IiLCJyZXRyeSIsIm5hbWUiLCJldmVudENhbGxiYWNrcyIsInB1c2giLCJjYiIsImxlbmd0aCIsImZvckVhY2giLCJjcmVhdGUiLCJjb25uZWN0VGltZW91dE1zIiwiUGFja2FnZSIsInRyYWNrZXIiLCJzdGF0dXNMaXN0ZW5lcnMiLCJUcmFja2VyIiwiRGVwZW5kZW5jeSIsImNoYW5nZWQiLCJfcmV0cnkiLCJyZWNvbm5lY3QiLCJfc29ja2pzT3B0aW9ucyIsIl9mb3JjZSIsImNsZWFyIiwiX3JldHJ5Tm93IiwiZGlzY29ubmVjdCIsIl9wZXJtYW5lbnQiLCJfZXJyb3IiLCJyZWFzb24iLCJfcmV0cnlMYXRlciIsIl9vbmxpbmUiLCJ0aW1lb3V0IiwicmV0cnlMYXRlciIsImJpbmQiLCJyZXRyeVRpbWUiLCJEYXRlIiwiZ2V0VGltZSIsImRlcGVuZCIsInRvU29ja2pzVXJsIiwidHJhbnNsYXRlVXJsIiwibmV3U2NoZW1lQmFzZSIsInN1YlBhdGgiLCJzdGFydHNXaXRoIiwiYWJzb2x1dGVVcmwiLCJzdWJzdHIiLCJkZHBVcmxNYXRjaCIsImh0dHBVcmxNYXRjaCIsIm5ld1NjaGVtZSIsInVybEFmdGVyRERQIiwic2xhc2hQb3MiLCJob3N0IiwicmVzdCIsIk1hdGgiLCJmbG9vciIsInJhbmRvbSIsInVybEFmdGVySHR0cCIsIl9yZWxhdGl2ZVRvU2l0ZVJvb3RVcmwiLCJlbmRzV2l0aCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFBQSxJQUFJQSx5QkFBeUI7RUFBQ0MsT0FBTyxDQUFDQyxJQUFJLENBQUMsd0JBQXdCLEVBQUM7SUFBQ0YseUJBQXlCLENBQUNHLENBQUMsRUFBQztNQUFDSCx5QkFBeUIsR0FBQ0csQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUlsSUgseUJBQXlCLENBQUM7SUFDeEJJLE1BQU0sRUFBRSxFQUFFO0lBQ1ZDLElBQUksRUFBRSxFQUFFO0lBQ1JDLE9BQU8sRUFBRSxFQUFFO0lBQ1hDLEVBQUUsRUFBRSxFQUFFO0lBQ05DLFlBQVksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDcEJDLFNBQVMsRUFBRSxDQUFDO0lBQ1pDLE1BQU0sRUFBRSxDQUFDO0lBQ1RDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFO0VBQ2xCLENBQUMsRUFBRUMsTUFBTSxDQUFDQyxFQUFFLENBQUM7RUFFYixJQUFJQyxPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsY0FBYyxFQUFFO0lBQzlCQyx5QkFBeUIsQ0FBQ0QsY0FBYyxHQUFHRixPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsY0FBYztFQUN2RTtBQUFDLHFCOzs7Ozs7Ozs7Ozs7RUNqQkRmLE9BQU8sQ0FBQ2lCLE1BQU0sQ0FBQztJQUFDQyxZQUFZLEVBQUMsTUFBSUE7RUFBWSxDQUFDLENBQUM7RUFBQyxJQUFJQyxNQUFNO0VB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QUFLLENBQUMsQ0FBQyxJQUFJLENBQUMxQixHQUFHLENBQUNrRyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDckRsRyxHQUFHLEdBQUdnRyxhQUFhLEdBQUcsS0FBSyxHQUFHaEcsR0FBRztFQUNuQzs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBQSxHQUFHLEdBQUdoQixNQUFNLENBQUNnSSxzQkFBc0IsQ0FBQ2hILEdBQUcsQ0FBQztFQUV4QyxJQUFJQSxHQUFHLENBQUNpSCxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBT2pILEdBQUcsR0FBR2lHLE9BQU8sQ0FBQyxLQUN2QyxPQUFPakcsR0FBRyxHQUFHLEdBQUcsR0FBR2lHLE9BQU87QUFDakM7QUFFTyxTQUFTSCxXQUFXLENBQUM5RixHQUFHLEVBQUU7RUFDL0IsT0FBTytGLFlBQVksQ0FBQy9GLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQzVDO0FBRU8sU0FBU2YsY0FBYyxDQUFDZSxHQUFHLEVBQUU7RUFDbEMsT0FBTytGLFlBQVksQ0FBQy9GLEdBQUcsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDO0FBQzdDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL3NvY2tldC1zdHJlYW0tY2xpZW50LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgc2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyxcbn0gZnJvbSBcIm1ldGVvci9tb2Rlcm4tYnJvd3NlcnNcIjtcblxuc2V0TWluaW11bUJyb3dzZXJWZXJzaW9ucyh7XG4gIGNocm9tZTogMTYsXG4gIGVkZ2U6IDEyLFxuICBmaXJlZm94OiAxMSxcbiAgaWU6IDEwLFxuICBtb2JpbGVTYWZhcmk6IFs2LCAxXSxcbiAgcGhhbnRvbWpzOiAyLFxuICBzYWZhcmk6IDcsXG4gIGVsZWN0cm9uOiBbMCwgMjBdLFxufSwgbW9kdWxlLmlkKTtcblxuaWYgKHByb2Nlc3MuZW52LkRJU0FCTEVfU09DS0pTKSB7XG4gIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uRElTQUJMRV9TT0NLSlMgPSBwcm9jZXNzLmVudi5ESVNBQkxFX1NPQ0tKUztcbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tIFwibWV0ZW9yL21ldGVvclwiO1xuaW1wb3J0IHsgdG9XZWJzb2NrZXRVcmwgfSBmcm9tIFwiLi91cmxzLmpzXCI7XG5pbXBvcnQgeyBTdHJlYW1DbGllbnRDb21tb24gfSBmcm9tIFwiLi9jb21tb24uanNcIjtcblxuLy8gQHBhcmFtIGVuZHBvaW50IHtTdHJpbmd9IFVSTCB0byBNZXRlb3IgYXBwXG4vLyAgIFwiaHR0cDovL3N1YmRvbWFpbi5tZXRlb3IuY29tL1wiIG9yIFwiL1wiIG9yXG4vLyAgIFwiZGRwK3NvY2tqczovL2Zvby0qKi5tZXRlb3IuY29tL3NvY2tqc1wiXG4vL1xuLy8gV2UgZG8gc29tZSByZXdyaXRpbmcgb2YgdGhlIFVSTCB0byBldmVudHVhbGx5IG1ha2UgaXQgXCJ3czovL1wiIG9yIFwid3NzOi8vXCIsXG4vLyB3aGF0ZXZlciB3YXMgcGFzc2VkIGluLiAgQXQgdGhlIHZlcnkgbGVhc3QsIHdoYXQgTWV0ZW9yLmFic29sdXRlVXJsKCkgcmV0dXJuc1xuLy8gdXMgc2hvdWxkIHdvcmsuXG4vL1xuLy8gV2UgZG9uJ3QgZG8gYW55IGhlYXJ0YmVhdGluZy4gKFRoZSBsb2dpYyB0aGF0IGRpZCB0aGlzIGluIHNvY2tqcyB3YXMgcmVtb3ZlZCxcbi8vIGJlY2F1c2UgaXQgdXNlZCBhIGJ1aWx0LWluIHNvY2tqcyBtZWNoYW5pc20uIFdlIGNvdWxkIGRvIGl0IHdpdGggV2ViU29ja2V0XG4vLyBwaW5nIGZyYW1lcyBvciB3aXRoIEREUC1sZXZlbCBtZXNzYWdlcy4pXG5leHBvcnQgY2xhc3MgQ2xpZW50U3RyZWFtIGV4dGVuZHMgU3RyZWFtQ2xpZW50Q29tbW9uIHtcbiAgY29uc3RydWN0b3IoZW5kcG9pbnQsIG9wdGlvbnMpIHtcbiAgICBzdXBlcihvcHRpb25zKTtcblxuICAgIHRoaXMuY2xpZW50ID0gbnVsbDsgLy8gY3JlYXRlZCBpbiBfbGF1bmNoQ29ubmVjdGlvblxuICAgIHRoaXMuZW5kcG9pbnQgPSBlbmRwb2ludDtcblxuICAgIHRoaXMuaGVhZGVycyA9IHRoaXMub3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICAgIHRoaXMubnBtRmF5ZU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMubnBtRmF5ZU9wdGlvbnMgfHwge307XG5cbiAgICB0aGlzLl9pbml0Q29tbW9uKHRoaXMub3B0aW9ucyk7XG5cbiAgICAvLy8vIEtpY2tvZmYhXG4gICAgdGhpcy5fbGF1bmNoQ29ubmVjdGlvbigpO1xuICB9XG5cbiAgLy8gZGF0YSBpcyBhIHV0Zjggc3RyaW5nLiBEYXRhIHNlbnQgd2hpbGUgbm90IGNvbm5lY3RlZCBpcyBkcm9wcGVkIG9uXG4gIC8vIHRoZSBmbG9vciwgYW5kIGl0IGlzIHVwIHRoZSB1c2VyIG9mIHRoaXMgQVBJIHRvIHJldHJhbnNtaXQgbG9zdFxuICAvLyBtZXNzYWdlcyBvbiAncmVzZXQnXG4gIHNlbmQoZGF0YSkge1xuICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkKSB7XG4gICAgICB0aGlzLmNsaWVudC5zZW5kKGRhdGEpO1xuICAgIH1cbiAgfVxuXG4gIC8vIENoYW5nZXMgd2hlcmUgdGhpcyBjb25uZWN0aW9uIHBvaW50c1xuICBfY2hhbmdlVXJsKHVybCkge1xuICAgIHRoaXMuZW5kcG9pbnQgPSB1cmw7XG4gIH1cblxuICBfb25Db25uZWN0KGNsaWVudCkge1xuICAgIGlmIChjbGllbnQgIT09IHRoaXMuY2xpZW50KSB7XG4gICAgICAvLyBUaGlzIGNvbm5lY3Rpb24gaXMgbm90IGZyb20gdGhlIGxhc3QgY2FsbCB0byBfbGF1bmNoQ29ubmVjdGlvbi5cbiAgICAgIC8vIEJ1dCBfbGF1bmNoQ29ubmVjdGlvbiBjYWxscyBfY2xlYW51cCB3aGljaCBjbG9zZXMgcHJldmlvdXMgY29ubmVjdGlvbnMuXG4gICAgICAvLyBJdCdzIG91ciBiZWxpZWYgdGhhdCB0aGlzIHN0aWZsZXMgZnV0dXJlICdvcGVuJyBldmVudHMsIGJ1dCBtYXliZVxuICAgICAgLy8gd2UgYXJlIHdyb25nP1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3Qgb3BlbiBmcm9tIGluYWN0aXZlIGNsaWVudCAnICsgISF0aGlzLmNsaWVudCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2ZvcmNlZFRvRGlzY29ubmVjdCkge1xuICAgICAgLy8gV2Ugd2VyZSBhc2tlZCB0byBkaXNjb25uZWN0IGJldHdlZW4gdHJ5aW5nIHRvIG9wZW4gdGhlIGNvbm5lY3Rpb24gYW5kXG4gICAgICAvLyBhY3R1YWxseSBvcGVuaW5nIGl0LiBMZXQncyBqdXN0IHByZXRlbmQgdGhpcyBuZXZlciBoYXBwZW5lZC5cbiAgICAgIHRoaXMuY2xpZW50LmNsb3NlKCk7XG4gICAgICB0aGlzLmNsaWVudCA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY3VycmVudFN0YXR1cy5jb25uZWN0ZWQpIHtcbiAgICAgIC8vIFdlIGFscmVhZHkgaGF2ZSBhIGNvbm5lY3Rpb24uIEl0IG11c3QgaGF2ZSBiZWVuIHRoZSBjYXNlIHRoYXQgd2VcbiAgICAgIC8vIHN0YXJ0ZWQgdHdvIHBhcmFsbGVsIGNvbm5lY3Rpb24gYXR0ZW1wdHMgKGJlY2F1c2Ugd2Ugd2FudGVkIHRvXG4gICAgICAvLyAncmVjb25uZWN0IG5vdycgb24gYSBoYW5naW5nIGNvbm5lY3Rpb24gYW5kIHdlIGhhZCBubyB3YXkgdG8gY2FuY2VsIHRoZVxuICAgICAgLy8gY29ubmVjdGlvbiBhdHRlbXB0LikgQnV0IHRoaXMgc2hvdWxkbid0IGhhcHBlbiAoc2ltaWxhcmx5IHRvIHRoZSBjbGllbnRcbiAgICAgIC8vICE9PSB0aGlzLmNsaWVudCBjaGVjayBhYm92ZSkuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1R3byBwYXJhbGxlbCBjb25uZWN0aW9ucz8nKTtcbiAgICB9XG5cbiAgICB0aGlzLl9jbGVhckNvbm5lY3Rpb25UaW1lcigpO1xuXG4gICAgLy8gdXBkYXRlIHN0YXR1c1xuICAgIHRoaXMuY3VycmVudFN0YXR1cy5zdGF0dXMgPSAnY29ubmVjdGVkJztcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkID0gdHJ1ZTtcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmV0cnlDb3VudCA9IDA7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkKCk7XG5cbiAgICAvLyBmaXJlIHJlc2V0cy4gVGhpcyBtdXN0IGNvbWUgYWZ0ZXIgc3RhdHVzIGNoYW5nZSBzbyB0aGF0IGNsaWVudHNcbiAgICAvLyBjYW4gY2FsbCBzZW5kIGZyb20gd2l0aGluIGEgcmVzZXQgY2FsbGJhY2suXG4gICAgdGhpcy5mb3JFYWNoQ2FsbGJhY2soJ3Jlc2V0JywgY2FsbGJhY2sgPT4ge1xuICAgICAgY2FsbGJhY2soKTtcbiAgICB9KTtcbiAgfVxuXG4gIF9jbGVhbnVwKG1heWJlRXJyb3IpIHtcbiAgICB0aGlzLl9jbGVhckNvbm5lY3Rpb25UaW1lcigpO1xuICAgIGlmICh0aGlzLmNsaWVudCkge1xuICAgICAgdmFyIGNsaWVudCA9IHRoaXMuY2xpZW50O1xuICAgICAgdGhpcy5jbGllbnQgPSBudWxsO1xuICAgICAgY2xpZW50LmNsb3NlKCk7XG5cbiAgICAgIHRoaXMuZm9yRWFjaENhbGxiYWNrKCdkaXNjb25uZWN0JywgY2FsbGJhY2sgPT4ge1xuICAgICAgICBjYWxsYmFjayhtYXliZUVycm9yKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIF9jbGVhckNvbm5lY3Rpb25UaW1lcigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uVGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLmNvbm5lY3Rpb25UaW1lcik7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25UaW1lciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgX2dldFByb3h5VXJsKHRhcmdldFVybCkge1xuICAgIC8vIFNpbWlsYXIgdG8gY29kZSBpbiB0b29scy9odHRwLWhlbHBlcnMuanMuXG4gICAgdmFyIHByb3h5ID0gcHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwX3Byb3h5IHx8IG51bGw7XG4gICAgdmFyIG5vcHJveHkgPSBwcm9jZXNzLmVudi5OT19QUk9YWSB8fCBwcm9jZXNzLmVudi5ub19wcm94eSB8fCBudWxsO1xuICAgIC8vIGlmIHdlJ3JlIGdvaW5nIHRvIGEgc2VjdXJlIHVybCwgdHJ5IHRoZSBodHRwc19wcm94eSBlbnYgdmFyaWFibGUgZmlyc3QuXG4gICAgaWYgKHRhcmdldFVybC5tYXRjaCgvXndzczovKcKgfHwgdGFyZ2V0VXJsLm1hdGNoKC9eaHR0cHM6LykpIHtcbiAgICAgIHByb3h5ID0gcHJvY2Vzcy5lbnYuSFRUUFNfUFJPWFkgfHwgcHJvY2Vzcy5lbnYuaHR0cHNfcHJveHkgfHwgcHJveHk7XG4gICAgfVxuICAgIGlmICh0YXJnZXRVcmwuaW5kZXhPZignbG9jYWxob3N0JykgIT0gLTEgfHzCoHRhcmdldFVybC5pbmRleE9mKCcxMjcuMC4wLjEnKSAhPSAtMSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChub3Byb3h5KSB7XG4gICAgICBmb3IgKGxldCBpdGVtIG9mIG5vcHJveHkuc3BsaXQoJywnKSkge1xuICAgICAgICBpZiAodGFyZ2V0VXJsLmluZGV4T2YoaXRlbS50cmltKCkucmVwbGFjZSgvXFwqLywgJycpKSAhPT0gLTEpIHtcbiAgICAgICAgICBwcm94eSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHByb3h5O1xuICB9XG5cbiAgX2xhdW5jaENvbm5lY3Rpb24oKSB7XG4gICAgdGhpcy5fY2xlYW51cCgpOyAvLyBjbGVhbnVwIHRoZSBvbGQgc29ja2V0LCBpZiB0aGVyZSB3YXMgb25lLlxuXG4gICAgLy8gU2luY2Ugc2VydmVyLXRvLXNlcnZlciBERFAgaXMgc3RpbGwgYW4gZXhwZXJpbWVudGFsIGZlYXR1cmUsIHdlIG9ubHlcbiAgICAvLyByZXF1aXJlIHRoZSBtb2R1bGUgaWYgd2UgYWN0dWFsbHkgY3JlYXRlIGEgc2VydmVyLXRvLXNlcnZlclxuICAgIC8vIGNvbm5lY3Rpb24uXG4gICAgdmFyIEZheWVXZWJTb2NrZXQgPSBOcG0ucmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKTtcbiAgICB2YXIgZGVmbGF0ZSA9IE5wbS5yZXF1aXJlKCdwZXJtZXNzYWdlLWRlZmxhdGUnKTtcblxuICAgIHZhciB0YXJnZXRVcmwgPSB0b1dlYnNvY2tldFVybCh0aGlzLmVuZHBvaW50KTtcbiAgICB2YXIgZmF5ZU9wdGlvbnMgPSB7XG4gICAgICBoZWFkZXJzOiB0aGlzLmhlYWRlcnMsXG4gICAgICBleHRlbnNpb25zOiBbZGVmbGF0ZV1cbiAgICB9O1xuICAgIGZheWVPcHRpb25zID0gT2JqZWN0LmFzc2lnbihmYXllT3B0aW9ucywgdGhpcy5ucG1GYXllT3B0aW9ucyk7XG4gICAgdmFyIHByb3h5VXJsID0gdGhpcy5fZ2V0UHJveHlVcmwodGFyZ2V0VXJsKTtcbiAgICBpZiAocHJveHlVcmwpIHtcbiAgICAgIGZheWVPcHRpb25zLnByb3h5ID0geyBvcmlnaW46IHByb3h5VXJsIH07XG4gICAgfVxuXG4gICAgLy8gV2Ugd291bGQgbGlrZSB0byBzcGVjaWZ5ICdkZHAnIGFzIHRoZSBzdWJwcm90b2NvbCBoZXJlLiBUaGUgbnBtIG1vZHVsZSB3ZVxuICAgIC8vIHVzZWQgdG8gdXNlIGFzIGEgY2xpZW50IHdvdWxkIGZhaWwgdGhlIGhhbmRzaGFrZSBpZiB3ZSBhc2sgZm9yIGFcbiAgICAvLyBzdWJwcm90b2NvbCBhbmQgdGhlIHNlcnZlciBkb2Vzbid0IHNlbmQgb25lIGJhY2sgKGFuZCBzb2NranMgZG9lc24ndCkuXG4gICAgLy8gRmF5ZSBkb2Vzbid0IGhhdmUgdGhhdCBiZWhhdmlvcjsgaXQncyB1bmNsZWFyIGZyb20gcmVhZGluZyBSRkMgNjQ1NSBpZlxuICAgIC8vIEZheWUgaXMgZXJyb25lb3VzIG9yIG5vdC4gIFNvIGZvciBub3csIHdlIGRvbid0IHNwZWNpZnkgcHJvdG9jb2xzLlxuICAgIHZhciBzdWJwcm90b2NvbHMgPSBbXTtcblxuICAgIHZhciBjbGllbnQgPSAodGhpcy5jbGllbnQgPSBuZXcgRmF5ZVdlYlNvY2tldC5DbGllbnQoXG4gICAgICB0YXJnZXRVcmwsXG4gICAgICBzdWJwcm90b2NvbHMsXG4gICAgICBmYXllT3B0aW9uc1xuICAgICkpO1xuXG4gICAgdGhpcy5fY2xlYXJDb25uZWN0aW9uVGltZXIoKTtcbiAgICB0aGlzLmNvbm5lY3Rpb25UaW1lciA9IE1ldGVvci5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMuX2xvc3RDb25uZWN0aW9uKG5ldyB0aGlzLkNvbm5lY3Rpb25FcnJvcignRERQIGNvbm5lY3Rpb24gdGltZWQgb3V0JykpO1xuICAgIH0sIHRoaXMuQ09OTkVDVF9USU1FT1VUKTtcblxuICAgIHRoaXMuY2xpZW50Lm9uKFxuICAgICAgJ29wZW4nLFxuICAgICAgTWV0ZW9yLmJpbmRFbnZpcm9ubWVudCgoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9vbkNvbm5lY3QoY2xpZW50KTtcbiAgICAgIH0sICdzdHJlYW0gY29ubmVjdCBjYWxsYmFjaycpXG4gICAgKTtcblxuICAgIHZhciBjbGllbnRPbklmQ3VycmVudCA9IChldmVudCwgZGVzY3JpcHRpb24sIGNhbGxiYWNrKSA9PiB7XG4gICAgICB0aGlzLmNsaWVudC5vbihcbiAgICAgICAgZXZlbnQsXG4gICAgICAgIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoKC4uLmFyZ3MpID0+IHtcbiAgICAgICAgICAvLyBJZ25vcmUgZXZlbnRzIGZyb20gYW55IGNvbm5lY3Rpb24gd2UndmUgYWxyZWFkeSBjbGVhbmVkIHVwLlxuICAgICAgICAgIGlmIChjbGllbnQgIT09IHRoaXMuY2xpZW50KSByZXR1cm47XG4gICAgICAgICAgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgICAgIH0sIGRlc2NyaXB0aW9uKVxuICAgICAgKTtcbiAgICB9O1xuXG4gICAgY2xpZW50T25JZkN1cnJlbnQoJ2Vycm9yJywgJ3N0cmVhbSBlcnJvciBjYWxsYmFjaycsIGVycm9yID0+IHtcbiAgICAgIGlmICghdGhpcy5vcHRpb25zLl9kb250UHJpbnRFcnJvcnMpXG4gICAgICAgIE1ldGVvci5fZGVidWcoJ3N0cmVhbSBlcnJvcicsIGVycm9yLm1lc3NhZ2UpO1xuXG4gICAgICAvLyBGYXllJ3MgJ2Vycm9yJyBvYmplY3QgaXMgbm90IGEgSlMgZXJyb3IgKGFuZCBhbW9uZyBvdGhlciB0aGluZ3MsXG4gICAgICAvLyBkb2Vzbid0IHN0cmluZ2lmeSB3ZWxsKS4gQ29udmVydCBpdCB0byBvbmUuXG4gICAgICB0aGlzLl9sb3N0Q29ubmVjdGlvbihuZXcgdGhpcy5Db25uZWN0aW9uRXJyb3IoZXJyb3IubWVzc2FnZSkpO1xuICAgIH0pO1xuXG4gICAgY2xpZW50T25JZkN1cnJlbnQoJ2Nsb3NlJywgJ3N0cmVhbSBjbG9zZSBjYWxsYmFjaycsICgpID0+IHtcbiAgICAgIHRoaXMuX2xvc3RDb25uZWN0aW9uKCk7XG4gICAgfSk7XG5cbiAgICBjbGllbnRPbklmQ3VycmVudCgnbWVzc2FnZScsICdzdHJlYW0gbWVzc2FnZSBjYWxsYmFjaycsIG1lc3NhZ2UgPT4ge1xuICAgICAgLy8gSWdub3JlIGJpbmFyeSBmcmFtZXMsIHdoZXJlIG1lc3NhZ2UuZGF0YSBpcyBhIEJ1ZmZlclxuICAgICAgaWYgKHR5cGVvZiBtZXNzYWdlLmRhdGEgIT09ICdzdHJpbmcnKSByZXR1cm47XG5cbiAgICAgIHRoaXMuZm9yRWFjaENhbGxiYWNrKCdtZXNzYWdlJywgY2FsbGJhY2sgPT4ge1xuICAgICAgICBjYWxsYmFjayhtZXNzYWdlLmRhdGEpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiIsImltcG9ydCB7IFJldHJ5IH0gZnJvbSAnbWV0ZW9yL3JldHJ5JztcblxuY29uc3QgZm9yY2VkUmVjb25uZWN0RXJyb3IgPSBuZXcgRXJyb3IoXCJmb3JjZWQgcmVjb25uZWN0XCIpO1xuXG5leHBvcnQgY2xhc3MgU3RyZWFtQ2xpZW50Q29tbW9uIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgIHJldHJ5OiB0cnVlLFxuICAgICAgLi4uKG9wdGlvbnMgfHwgbnVsbCksXG4gICAgfTtcblxuICAgIHRoaXMuQ29ubmVjdGlvbkVycm9yID1cbiAgICAgIG9wdGlvbnMgJiYgb3B0aW9ucy5Db25uZWN0aW9uRXJyb3IgfHwgRXJyb3I7XG4gIH1cblxuICAvLyBSZWdpc3RlciBmb3IgY2FsbGJhY2tzLlxuICBvbihuYW1lLCBjYWxsYmFjaykge1xuICAgIGlmIChuYW1lICE9PSAnbWVzc2FnZScgJiYgbmFtZSAhPT0gJ3Jlc2V0JyAmJiBuYW1lICE9PSAnZGlzY29ubmVjdCcpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vua25vd24gZXZlbnQgdHlwZTogJyArIG5hbWUpO1xuXG4gICAgaWYgKCF0aGlzLmV2ZW50Q2FsbGJhY2tzW25hbWVdKSB0aGlzLmV2ZW50Q2FsbGJhY2tzW25hbWVdID0gW107XG4gICAgdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXS5wdXNoKGNhbGxiYWNrKTtcbiAgfVxuXG4gIGZvckVhY2hDYWxsYmFjayhuYW1lLCBjYikge1xuICAgIGlmICghdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXSB8fCAhdGhpcy5ldmVudENhbGxiYWNrc1tuYW1lXS5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmV2ZW50Q2FsbGJhY2tzW25hbWVdLmZvckVhY2goY2IpO1xuICB9XG5cbiAgX2luaXRDb21tb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICAvLy8vIENvbnN0YW50c1xuXG4gICAgLy8gaG93IGxvbmcgdG8gd2FpdCB1bnRpbCB3ZSBkZWNsYXJlIHRoZSBjb25uZWN0aW9uIGF0dGVtcHRcbiAgICAvLyBmYWlsZWQuXG4gICAgdGhpcy5DT05ORUNUX1RJTUVPVVQgPSBvcHRpb25zLmNvbm5lY3RUaW1lb3V0TXMgfHwgMTAwMDA7XG5cbiAgICB0aGlzLmV2ZW50Q2FsbGJhY2tzID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gbmFtZSAtPiBbY2FsbGJhY2tdXG5cbiAgICB0aGlzLl9mb3JjZWRUb0Rpc2Nvbm5lY3QgPSBmYWxzZTtcblxuICAgIC8vLy8gUmVhY3RpdmUgc3RhdHVzXG4gICAgdGhpcy5jdXJyZW50U3RhdHVzID0ge1xuICAgICAgc3RhdHVzOiAnY29ubmVjdGluZycsXG4gICAgICBjb25uZWN0ZWQ6IGZhbHNlLFxuICAgICAgcmV0cnlDb3VudDogMFxuICAgIH07XG5cbiAgICBpZiAoUGFja2FnZS50cmFja2VyKSB7XG4gICAgICB0aGlzLnN0YXR1c0xpc3RlbmVycyA9IG5ldyBQYWNrYWdlLnRyYWNrZXIuVHJhY2tlci5EZXBlbmRlbmN5KCk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkID0gKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuc3RhdHVzTGlzdGVuZXJzKSB7XG4gICAgICAgIHRoaXMuc3RhdHVzTGlzdGVuZXJzLmNoYW5nZWQoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8vLyBSZXRyeSBsb2dpY1xuICAgIHRoaXMuX3JldHJ5ID0gbmV3IFJldHJ5KCk7XG4gICAgdGhpcy5jb25uZWN0aW9uVGltZXIgPSBudWxsO1xuICB9XG5cbiAgLy8gVHJpZ2dlciBhIHJlY29ubmVjdC5cbiAgcmVjb25uZWN0KG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gICAgaWYgKG9wdGlvbnMudXJsKSB7XG4gICAgICB0aGlzLl9jaGFuZ2VVcmwob3B0aW9ucy51cmwpO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25zLl9zb2NranNPcHRpb25zKSB7XG4gICAgICB0aGlzLm9wdGlvbnMuX3NvY2tqc09wdGlvbnMgPSBvcHRpb25zLl9zb2NranNPcHRpb25zO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkKSB7XG4gICAgICBpZiAob3B0aW9ucy5fZm9yY2UgfHwgb3B0aW9ucy51cmwpIHtcbiAgICAgICAgdGhpcy5fbG9zdENvbm5lY3Rpb24oZm9yY2VkUmVjb25uZWN0RXJyb3IpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGlmIHdlJ3JlIG1pZC1jb25uZWN0aW9uLCBzdG9wIGl0LlxuICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0dXMuc3RhdHVzID09PSAnY29ubmVjdGluZycpIHtcbiAgICAgIC8vIFByZXRlbmQgaXQncyBhIGNsZWFuIGNsb3NlLlxuICAgICAgdGhpcy5fbG9zdENvbm5lY3Rpb24oKTtcbiAgICB9XG5cbiAgICB0aGlzLl9yZXRyeS5jbGVhcigpO1xuICAgIHRoaXMuY3VycmVudFN0YXR1cy5yZXRyeUNvdW50IC09IDE7IC8vIGRvbid0IGNvdW50IG1hbnVhbCByZXRyaWVzXG4gICAgdGhpcy5fcmV0cnlOb3coKTtcbiAgfVxuXG4gIGRpc2Nvbm5lY3Qob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICAvLyBGYWlsZWQgaXMgcGVybWFuZW50LiBJZiB3ZSdyZSBmYWlsZWQsIGRvbid0IGxldCBwZW9wbGUgZ28gYmFja1xuICAgIC8vIG9ubGluZSBieSBjYWxsaW5nICdkaXNjb25uZWN0JyB0aGVuICdyZWNvbm5lY3QnLlxuICAgIGlmICh0aGlzLl9mb3JjZWRUb0Rpc2Nvbm5lY3QpIHJldHVybjtcblxuICAgIC8vIElmIF9wZXJtYW5lbnQgaXMgc2V0LCBwZXJtYW5lbnRseSBkaXNjb25uZWN0IGEgc3RyZWFtLiBPbmNlIGEgc3RyZWFtXG4gICAgLy8gaXMgZm9yY2VkIHRvIGRpc2Nvbm5lY3QsIGl0IGNhbiBuZXZlciByZWNvbm5lY3QuIFRoaXMgaXMgZm9yXG4gICAgLy8gZXJyb3IgY2FzZXMgc3VjaCBhcyBkZHAgdmVyc2lvbiBtaXNtYXRjaCwgd2hlcmUgdHJ5aW5nIGFnYWluXG4gICAgLy8gd29uJ3QgZml4IHRoZSBwcm9ibGVtLlxuICAgIGlmIChvcHRpb25zLl9wZXJtYW5lbnQpIHtcbiAgICAgIHRoaXMuX2ZvcmNlZFRvRGlzY29ubmVjdCA9IHRydWU7XG4gICAgfVxuXG4gICAgdGhpcy5fY2xlYW51cCgpO1xuICAgIHRoaXMuX3JldHJ5LmNsZWFyKCk7XG5cbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMgPSB7XG4gICAgICBzdGF0dXM6IG9wdGlvbnMuX3Blcm1hbmVudCA/ICdmYWlsZWQnIDogJ29mZmxpbmUnLFxuICAgICAgY29ubmVjdGVkOiBmYWxzZSxcbiAgICAgIHJldHJ5Q291bnQ6IDBcbiAgICB9O1xuXG4gICAgaWYgKG9wdGlvbnMuX3Blcm1hbmVudCAmJiBvcHRpb25zLl9lcnJvcilcbiAgICAgIHRoaXMuY3VycmVudFN0YXR1cy5yZWFzb24gPSBvcHRpb25zLl9lcnJvcjtcblxuICAgIHRoaXMuc3RhdHVzQ2hhbmdlZCgpO1xuICB9XG5cbiAgLy8gbWF5YmVFcnJvciBpcyBzZXQgdW5sZXNzIGl0J3MgYSBjbGVhbiBwcm90b2NvbC1sZXZlbCBjbG9zZS5cbiAgX2xvc3RDb25uZWN0aW9uKG1heWJlRXJyb3IpIHtcbiAgICB0aGlzLl9jbGVhbnVwKG1heWJlRXJyb3IpO1xuICAgIHRoaXMuX3JldHJ5TGF0ZXIobWF5YmVFcnJvcik7IC8vIHNldHMgc3RhdHVzLiBubyBuZWVkIHRvIGRvIGl0IGhlcmUuXG4gIH1cblxuICAvLyBmaXJlZCB3aGVuIHdlIGRldGVjdCB0aGF0IHdlJ3ZlIGdvbmUgb25saW5lLiB0cnkgdG8gcmVjb25uZWN0XG4gIC8vIGltbWVkaWF0ZWx5LlxuICBfb25saW5lKCkge1xuICAgIC8vIGlmIHdlJ3ZlIHJlcXVlc3RlZCB0byBiZSBvZmZsaW5lIGJ5IGRpc2Nvbm5lY3RpbmcsIGRvbid0IHJlY29ubmVjdC5cbiAgICBpZiAodGhpcy5jdXJyZW50U3RhdHVzLnN0YXR1cyAhPSAnb2ZmbGluZScpIHRoaXMucmVjb25uZWN0KCk7XG4gIH1cblxuICBfcmV0cnlMYXRlcihtYXliZUVycm9yKSB7XG4gICAgdmFyIHRpbWVvdXQgPSAwO1xuICAgIGlmICh0aGlzLm9wdGlvbnMucmV0cnkgfHxcbiAgICAgICAgbWF5YmVFcnJvciA9PT0gZm9yY2VkUmVjb25uZWN0RXJyb3IpIHtcbiAgICAgIHRpbWVvdXQgPSB0aGlzLl9yZXRyeS5yZXRyeUxhdGVyKFxuICAgICAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmV0cnlDb3VudCxcbiAgICAgICAgdGhpcy5fcmV0cnlOb3cuYmluZCh0aGlzKVxuICAgICAgKTtcbiAgICAgIHRoaXMuY3VycmVudFN0YXR1cy5zdGF0dXMgPSAnd2FpdGluZyc7XG4gICAgICB0aGlzLmN1cnJlbnRTdGF0dXMucmV0cnlUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgKyB0aW1lb3V0O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmN1cnJlbnRTdGF0dXMuc3RhdHVzID0gJ2ZhaWxlZCc7XG4gICAgICBkZWxldGUgdGhpcy5jdXJyZW50U3RhdHVzLnJldHJ5VGltZTtcbiAgICB9XG5cbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMuY29ubmVjdGVkID0gZmFsc2U7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkKCk7XG4gIH1cblxuICBfcmV0cnlOb3coKSB7XG4gICAgaWYgKHRoaXMuX2ZvcmNlZFRvRGlzY29ubmVjdCkgcmV0dXJuO1xuXG4gICAgdGhpcy5jdXJyZW50U3RhdHVzLnJldHJ5Q291bnQgKz0gMTtcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMuc3RhdHVzID0gJ2Nvbm5lY3RpbmcnO1xuICAgIHRoaXMuY3VycmVudFN0YXR1cy5jb25uZWN0ZWQgPSBmYWxzZTtcbiAgICBkZWxldGUgdGhpcy5jdXJyZW50U3RhdHVzLnJldHJ5VGltZTtcbiAgICB0aGlzLnN0YXR1c0NoYW5nZWQoKTtcblxuICAgIHRoaXMuX2xhdW5jaENvbm5lY3Rpb24oKTtcbiAgfVxuXG4gIC8vIEdldCBjdXJyZW50IHN0YXR1cy4gUmVhY3RpdmUuXG4gIHN0YXR1cygpIHtcbiAgICBpZiAodGhpcy5zdGF0dXNMaXN0ZW5lcnMpIHtcbiAgICAgIHRoaXMuc3RhdHVzTGlzdGVuZXJzLmRlcGVuZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jdXJyZW50U3RhdHVzO1xuICB9XG59XG4iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tIFwibWV0ZW9yL21ldGVvclwiO1xuXG4vLyBAcGFyYW0gdXJsIHtTdHJpbmd9IFVSTCB0byBNZXRlb3IgYXBwLCBlZzpcbi8vICAgXCIvXCIgb3IgXCJtYWRld2l0aC5tZXRlb3IuY29tXCIgb3IgXCJodHRwczovL2Zvby5tZXRlb3IuY29tXCJcbi8vICAgb3IgXCJkZHArc29ja2pzOi8vZGRwLS0qKioqLWZvby5tZXRlb3IuY29tL3NvY2tqc1wiXG4vLyBAcmV0dXJucyB7U3RyaW5nfSBVUkwgdG8gdGhlIGVuZHBvaW50IHdpdGggdGhlIHNwZWNpZmljIHNjaGVtZSBhbmQgc3ViUGF0aCwgZS5nLlxuLy8gZm9yIHNjaGVtZSBcImh0dHBcIiBhbmQgc3ViUGF0aCBcInNvY2tqc1wiXG4vLyAgIFwiaHR0cDovL3N1YmRvbWFpbi5tZXRlb3IuY29tL3NvY2tqc1wiIG9yIFwiL3NvY2tqc1wiXG4vLyAgIG9yIFwiaHR0cHM6Ly9kZHAtLTEyMzQtZm9vLm1ldGVvci5jb20vc29ja2pzXCJcbmZ1bmN0aW9uIHRyYW5zbGF0ZVVybCh1cmwsIG5ld1NjaGVtZUJhc2UsIHN1YlBhdGgpIHtcbiAgaWYgKCFuZXdTY2hlbWVCYXNlKSB7XG4gICAgbmV3U2NoZW1lQmFzZSA9ICdodHRwJztcbiAgfVxuXG4gIGlmIChzdWJQYXRoICE9PSBcInNvY2tqc1wiICYmIHVybC5zdGFydHNXaXRoKFwiL1wiKSkge1xuICAgIHVybCA9IE1ldGVvci5hYnNvbHV0ZVVybCh1cmwuc3Vic3RyKDEpKTtcbiAgfVxuXG4gIHZhciBkZHBVcmxNYXRjaCA9IHVybC5tYXRjaCgvXmRkcChpPylcXCtzb2NranM6XFwvXFwvLyk7XG4gIHZhciBodHRwVXJsTWF0Y2ggPSB1cmwubWF0Y2goL15odHRwKHM/KTpcXC9cXC8vKTtcbiAgdmFyIG5ld1NjaGVtZTtcbiAgaWYgKGRkcFVybE1hdGNoKSB7XG4gICAgLy8gUmVtb3ZlIHNjaGVtZSBhbmQgc3BsaXQgb2ZmIHRoZSBob3N0LlxuICAgIHZhciB1cmxBZnRlckREUCA9IHVybC5zdWJzdHIoZGRwVXJsTWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICBuZXdTY2hlbWUgPSBkZHBVcmxNYXRjaFsxXSA9PT0gJ2knID8gbmV3U2NoZW1lQmFzZSA6IG5ld1NjaGVtZUJhc2UgKyAncyc7XG4gICAgdmFyIHNsYXNoUG9zID0gdXJsQWZ0ZXJERFAuaW5kZXhPZignLycpO1xuICAgIHZhciBob3N0ID0gc2xhc2hQb3MgPT09IC0xID8gdXJsQWZ0ZXJERFAgOiB1cmxBZnRlckREUC5zdWJzdHIoMCwgc2xhc2hQb3MpO1xuICAgIHZhciByZXN0ID0gc2xhc2hQb3MgPT09IC0xID8gJycgOiB1cmxBZnRlckREUC5zdWJzdHIoc2xhc2hQb3MpO1xuXG4gICAgLy8gSW4gdGhlIGhvc3QgKE9OTFkhKSwgY2hhbmdlICcqJyBjaGFyYWN0ZXJzIGludG8gcmFuZG9tIGRpZ2l0cy4gVGhpc1xuICAgIC8vIGFsbG93cyBkaWZmZXJlbnQgc3RyZWFtIGNvbm5lY3Rpb25zIHRvIGNvbm5lY3QgdG8gZGlmZmVyZW50IGhvc3RuYW1lc1xuICAgIC8vIGFuZCBhdm9pZCBicm93c2VyIHBlci1ob3N0bmFtZSBjb25uZWN0aW9uIGxpbWl0cy5cbiAgICBob3N0ID0gaG9zdC5yZXBsYWNlKC9cXCovZywgKCkgPT4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTApKTtcblxuICAgIHJldHVybiBuZXdTY2hlbWUgKyAnOi8vJyArIGhvc3QgKyByZXN0O1xuICB9IGVsc2UgaWYgKGh0dHBVcmxNYXRjaCkge1xuICAgIG5ld1NjaGVtZSA9ICFodHRwVXJsTWF0Y2hbMV0gPyBuZXdTY2hlbWVCYXNlIDogbmV3U2NoZW1lQmFzZSArICdzJztcbiAgICB2YXIgdXJsQWZ0ZXJIdHRwID0gdXJsLnN1YnN0cihodHRwVXJsTWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICB1cmwgPSBuZXdTY2hlbWUgKyAnOi8vJyArIHVybEFmdGVySHR0cDtcbiAgfVxuXG4gIC8vIFByZWZpeCBGUUROcyBidXQgbm90IHJlbGF0aXZlIFVSTHNcbiAgaWYgKHVybC5pbmRleE9mKCc6Ly8nKSA9PT0gLTEgJiYgIXVybC5zdGFydHNXaXRoKCcvJykpIHtcbiAgICB1cmwgPSBuZXdTY2hlbWVCYXNlICsgJzovLycgKyB1cmw7XG4gIH1cblxuICAvLyBYWFggVGhpcyBpcyBub3Qgd2hhdCB3ZSBzaG91bGQgYmUgZG9pbmc6IGlmIEkgaGF2ZSBhIHNpdGVcbiAgLy8gZGVwbG95ZWQgYXQgXCIvZm9vXCIsIHRoZW4gRERQLmNvbm5lY3QoXCIvXCIpIHNob3VsZCBhY3R1YWxseSBjb25uZWN0XG4gIC8vIHRvIFwiL1wiLCBub3QgdG8gXCIvZm9vXCIuIFwiL1wiIGlzIGFuIGFic29sdXRlIHBhdGguIChDb250cmFzdDogaWZcbiAgLy8gZGVwbG95ZWQgYXQgXCIvZm9vXCIsIGl0IHdvdWxkIGJlIHJlYXNvbmFibGUgZm9yIEREUC5jb25uZWN0KFwiYmFyXCIpXG4gIC8vIHRvIGNvbm5lY3QgdG8gXCIvZm9vL2JhclwiKS5cbiAgLy9cbiAgLy8gV2Ugc2hvdWxkIG1ha2UgdGhpcyBwcm9wZXJseSBob25vciBhYnNvbHV0ZSBwYXRocyByYXRoZXIgdGhhblxuICAvLyBmb3JjaW5nIHRoZSBwYXRoIHRvIGJlIHJlbGF0aXZlIHRvIHRoZSBzaXRlIHJvb3QuIFNpbXVsdGFuZW91c2x5LFxuICAvLyB3ZSBzaG91bGQgc2V0IEREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMIHRvIGluY2x1ZGUgdGhlIHNpdGVcbiAgLy8gcm9vdC4gU2VlIGFsc28gY2xpZW50X2NvbnZlbmllbmNlLmpzICNSYXRpb25hbGl6aW5nUmVsYXRpdmVERFBVUkxzXG4gIHVybCA9IE1ldGVvci5fcmVsYXRpdmVUb1NpdGVSb290VXJsKHVybCk7XG5cbiAgaWYgKHVybC5lbmRzV2l0aCgnLycpKSByZXR1cm4gdXJsICsgc3ViUGF0aDtcbiAgZWxzZSByZXR1cm4gdXJsICsgJy8nICsgc3ViUGF0aDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvU29ja2pzVXJsKHVybCkge1xuICByZXR1cm4gdHJhbnNsYXRlVXJsKHVybCwgJ2h0dHAnLCAnc29ja2pzJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1dlYnNvY2tldFVybCh1cmwpIHtcbiAgcmV0dXJuIHRyYW5zbGF0ZVVybCh1cmwsICd3cycsICd3ZWJzb2NrZXQnKTtcbn1cbiJdfQ==
