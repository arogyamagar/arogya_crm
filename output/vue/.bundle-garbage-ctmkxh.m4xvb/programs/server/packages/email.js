(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Email, EmailInternals, EmailTest;

var require = meteorInstall({"node_modules":{"meteor":{"email":{"email.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// packages/email/email.js                                                                                          //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  module1.export({
    Email: () => Email,
    EmailTest: () => EmailTest,
    EmailInternals: () => EmailInternals
  });
  let Meteor;
  module1.link("meteor/meteor", {
    Meteor(v) {
      Meteor = v;
    }
  }, 0);
  let Log;
  module1.link("meteor/logging", {
    Log(v) {
      Log = v;
    }
  }, 1);
  let Hook;
  module1.link("meteor/callback-hook", {
    Hook(v) {
      Hook = v;
    }
  }, 2);
  let url;
  module1.link("url", {
    default(v) {
      url = v;
    }
  }, 3);
  let nodemailer;
  module1.link("nodemailer", {
    default(v) {
      nodemailer = v;
    }
  }, 4);
  let wellKnow;
  module1.link("nodemailer/lib/well-known", {
    default(v) {
      wellKnow = v;
    }
  }, 5);
  const Email = {};
  const EmailTest = {};
  const EmailInternals = {
    NpmModules: {
      mailcomposer: {
        version: Npm.require('nodemailer/package.json').version,
        module: Npm.require('nodemailer/lib/mail-composer')
      },
      nodemailer: {
        version: Npm.require('nodemailer/package.json').version,
        module: Npm.require('nodemailer')
      }
    }
  };
  const MailComposer = EmailInternals.NpmModules.mailcomposer.module;
  const makeTransport = function (mailUrlString) {
    const mailUrl = new URL(mailUrlString);
    if (mailUrl.protocol !== 'smtp:' && mailUrl.protocol !== 'smtps:') {
      throw new Error('Email protocol in $MAIL_URL (' + mailUrlString + ") must be 'smtp' or 'smtps'");
    }
    if (mailUrl.protocol === 'smtp:' && mailUrl.port === '465') {
      Log.debug("The $MAIL_URL is 'smtp://...:465'.  " + "You probably want 'smtps://' (The 's' enables TLS/SSL) " + "since '465' is typically a secure port.");
    }

    // Allow overriding pool setting, but default to true.
    if (!mailUrl.query) {
      mailUrl.query = {};
    }
    if (!mailUrl.query.pool) {
      mailUrl.query.pool = 'true';
    }
    const transport = nodemailer.createTransport(url.format(mailUrl));
    transport._syncSendMail = Meteor.wrapAsync(transport.sendMail, transport);
    return transport;
  };

  // More info: https://nodemailer.com/smtp/well-known/
  const knownHostsTransport = function () {
    let settings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
    let url = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : undefined;
    let service, user, password;
    const hasSettings = settings && Object.keys(settings).length;
    if (url && !hasSettings) {
      let host = url.split(':')[0];
      const urlObject = new URL(url);
      if (host === 'http' || host === 'https') {
        // Look to hostname for service
        host = urlObject.hostname;
        user = urlObject.username;
        password = urlObject.password;
      } else if (urlObject.protocol && urlObject.username && urlObject.password) {
        // We have some data from urlObject
        host = urlObject.protocol.split(':')[0];
        user = urlObject.username;
        password = urlObject.password;
      } else {
        var _urlObject$pathname$s;
        // We need to disect the URL ourselves to get the data
        // First get rid of the leading '//' and split to username and the rest
        const temp = (_urlObject$pathname$s = urlObject.pathname.substring(2)) === null || _urlObject$pathname$s === void 0 ? void 0 : _urlObject$pathname$s.split(':');
        user = temp[0];
        // Now we split by '@' to get password and hostname
        const temp2 = temp[1].split('@');
        password = temp2[0];
        host = temp2[1];
      }
      service = host;
    }
    if (!wellKnow((settings === null || settings === void 0 ? void 0 : settings.service) || service)) {
      throw new Error('Could not recognize e-mail service. See list at https://nodemailer.com/smtp/well-known/ for services that we can configure for you.');
    }
    const transport = nodemailer.createTransport({
      service: (settings === null || settings === void 0 ? void 0 : settings.service) || service,
      auth: {
        user: (settings === null || settings === void 0 ? void 0 : settings.user) || user,
        pass: (settings === null || settings === void 0 ? void 0 : settings.password) || password
      }
    });
    transport._syncSendMail = Meteor.wrapAsync(transport.sendMail, transport);
    return transport;
  };
  EmailTest.knowHostsTransport = knownHostsTransport;
  const getTransport = function () {
    var _Meteor$settings$pack;
    const packageSettings = ((_Meteor$settings$pack = Meteor.settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : _Meteor$settings$pack.email) || {};
    // We delay this check until the first call to Email.send, in case someone
    // set process.env.MAIL_URL in startup code. Then we store in a cache until
    // process.env.MAIL_URL changes.
    const url = process.env.MAIL_URL;
    if (this.cacheKey === undefined || this.cacheKey !== url || this.cacheKey !== packageSettings.service || this.cacheKey !== 'settings') {
      if (packageSettings.service && wellKnow(packageSettings.service) || url && wellKnow(new URL(url).hostname) || wellKnow((url === null || url === void 0 ? void 0 : url.split(':')[0]) || '')) {
        this.cacheKey = packageSettings.service || 'settings';
        this.cache = knownHostsTransport(packageSettings, url);
      } else {
        this.cacheKey = url;
        this.cache = url ? makeTransport(url, packageSettings) : null;
      }
    }
    return this.cache;
  };
  let nextDevModeMailId = 0;
  EmailTest._getAndIncNextDevModeMailId = function () {
    return nextDevModeMailId++;
  };

  // Testing hooks
  EmailTest.resetNextDevModeMailId = function () {
    nextDevModeMailId = 0;
  };
  const devModeSendAsync = function (mail, options) {
    const stream = (options === null || options === void 0 ? void 0 : options.stream) || process.stdout;
    return new Promise((resolve, reject) => {
      let devModeMailId = EmailTest._getAndIncNextDevModeMailId();

      // This approach does not prevent other writers to stdout from interleaving.
      const output = ['====== BEGIN MAIL #' + devModeMailId + ' ======\n'];
      output.push('(Mail not sent; to enable sending, set the MAIL_URL ' + 'environment variable.)\n');
      const readStream = new MailComposer(mail).compile().createReadStream();
      readStream.on('data', buffer => {
        output.push(buffer.toString());
      });
      readStream.on('end', function () {
        output.push('====== END MAIL #' + devModeMailId + ' ======\n');
        stream.write(output.join(''), () => resolve());
      });
      readStream.on('error', err => reject(err));
    });
  };
  const smtpSend = function (transport, mail) {
    transport._syncSendMail(mail);
  };
  const sendHooks = new Hook();

  /**
   * @summary Hook that runs before email is sent.
   * @locus Server
   *
   * @param f {function} receives the arguments to Email.send and should return true to go
   * ahead and send the email (or at least, try subsequent hooks), or
   * false to skip sending.
   * @returns {{ stop: function, callback: function }}
   */
  Email.hookSend = function (f) {
    return sendHooks.register(f);
  };

  /**
   * @summary Overrides sending function with your own.
   * @locus Server
   * @since 2.2
   * @param f {function} function that will receive options from the send function and under `packageSettings` will
   * include the package settings from Meteor.settings.packages.email for your custom transport to access.
   */
  Email.customTransport = undefined;

  /**
   * @summary Send an email. Throws an `Error` on failure to contact mail server
   * or if mail server returns an error. All fields should match
   * [RFC5322](http://tools.ietf.org/html/rfc5322) specification.
   *
   * If the `MAIL_URL` environment variable is set, actually sends the email.
   * Otherwise, prints the contents of the email to standard out.
   *
   * Note that this package is based on **nodemailer**, so make sure to refer to
   * [the documentation](http://nodemailer.com/)
   * when using the `attachments` or `mailComposer` options.
   *
   * @locus Server
   * @param {Object} options
   * @param {String} [options.from] "From:" address (required)
   * @param {String|String[]} options.to,cc,bcc,replyTo
   *   "To:", "Cc:", "Bcc:", and "Reply-To:" addresses
   * @param {String} [options.inReplyTo] Message-ID this message is replying to
   * @param {String|String[]} [options.references] Array (or space-separated string) of Message-IDs to refer to
   * @param {String} [options.messageId] Message-ID for this message; otherwise, will be set to a random value
   * @param {String} [options.subject]  "Subject:" line
   * @param {String} [options.text|html] Mail body (in plain text and/or HTML)
   * @param {String} [options.watchHtml] Mail body in HTML specific for Apple Watch
   * @param {String} [options.icalEvent] iCalendar event attachment
   * @param {Object} [options.headers] Dictionary of custom headers - e.g. `{ "header name": "header value" }`. To set an object under a header name, use `JSON.stringify` - e.g. `{ "header name": JSON.stringify({ tracking: { level: 'full' } }) }`.
   * @param {Object[]} [options.attachments] Array of attachment objects, as
   * described in the [nodemailer documentation](https://nodemailer.com/message/attachments/).
   * @param {MailComposer} [options.mailComposer] A [MailComposer](https://nodemailer.com/extras/mailcomposer/#e-mail-message-fields)
   * object representing the message to be sent.  Overrides all other options.
   * You can create a `MailComposer` object via
   * `new EmailInternals.NpmModules.mailcomposer.module`.
   */
  Email.send = function (options) {
    if (Email.customTransport) {
      var _Meteor$settings$pack2;
      // Preserve current behavior
      const email = options.mailComposer ? options.mailComposer.mail : options;
      let send = true;
      sendHooks.forEach(hook => {
        send = hook(email);
        return send;
      });
      if (!send) {
        return;
      }
      const packageSettings = ((_Meteor$settings$pack2 = Meteor.settings.packages) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.email) || {};
      Email.customTransport(_objectSpread({
        packageSettings
      }, email));
      return;
    }
    // Using Fibers Promise.await
    return Promise.await(Email.sendAsync(options));
  };

  /**
   * @summary Send an email with asyncronous method. Capture  Throws an `Error` on failure to contact mail server
   * or if mail server returns an error. All fields should match
   * [RFC5322](http://tools.ietf.org/html/rfc5322) specification.
   *
   * If the `MAIL_URL` environment variable is set, actually sends the email.
   * Otherwise, prints the contents of the email to standard out.
   *
   * Note that this package is based on **nodemailer**, so make sure to refer to
   * [the documentation](http://nodemailer.com/)
   * when using the `attachments` or `mailComposer` options.
   *
   * @locus Server
   * @return {Promise}
   * @param {Object} options
   * @param {String} [options.from] "From:" address (required)
   * @param {String|String[]} options.to,cc,bcc,replyTo
   *   "To:", "Cc:", "Bcc:", and "Reply-To:" addresses
   * @param {String} [options.inReplyTo] Message-ID this message is replying to
   * @param {String|String[]} [options.references] Array (or space-separated string) of Message-IDs to refer to
   * @param {String} [options.messageId] Message-ID for this message; otherwise, will be set to a random value
   * @param {String} [options.subject]  "Subject:" line
   * @param {String} [options.text|html] Mail body (in plain text and/or HTML)
   * @param {String} [options.watchHtml] Mail body in HTML specific for Apple Watch
   * @param {String} [options.icalEvent] iCalendar event attachment
   * @param {Object} [options.headers] Dictionary of custom headers - e.g. `{ "header name": "header value" }`. To set an object under a header name, use `JSON.stringify` - e.g. `{ "header name": JSON.stringify({ tracking: { level: 'full' } }) }`.
   * @param {Object[]} [options.attachments] Array of attachment objects, as
   * described in the [nodemailer documentation](https://nodemailer.com/message/attachments/).
   * @param {MailComposer} [options.mailComposer] A [MailComposer](https://nodemailer.com/extras/mailcomposer/#e-mail-message-fields)
   * object representing the message to be sent.  Overrides all other options.
   * You can create a `MailComposer` object via
   * `new EmailInternals.NpmModules.mailcomposer.module`.
   */
  Email.sendAsync = function (options) {
    return Promise.asyncApply(() => {
      var _Meteor$settings$pack4;
      const email = options.mailComposer ? options.mailComposer.mail : options;
      let send = true;
      sendHooks.forEach(hook => {
        send = hook(email);
        return send;
      });
      if (!send) {
        return;
      }
      if (Email.customTransport) {
        var _Meteor$settings$pack3;
        const packageSettings = ((_Meteor$settings$pack3 = Meteor.settings.packages) === null || _Meteor$settings$pack3 === void 0 ? void 0 : _Meteor$settings$pack3.email) || {};
        return Email.customTransport(_objectSpread({
          packageSettings
        }, email));
      }
      const mailUrlEnv = process.env.MAIL_URL;
      const mailUrlSettings = (_Meteor$settings$pack4 = Meteor.settings.packages) === null || _Meteor$settings$pack4 === void 0 ? void 0 : _Meteor$settings$pack4.email;
      if (Meteor.isProduction && !mailUrlEnv && !mailUrlSettings) {
        // This check is mostly necessary when using the flag --production when running locally.
        // And it works as a reminder to properly set the mail URL when running locally.
        throw new Error('You have not provided a mail URL. You can provide it by using the environment variable MAIL_URL or your settings. You can read more about it here: https://docs.meteor.com/api/email.html.');
      }
      if (mailUrlEnv || mailUrlSettings) {
        const transport = getTransport();
        smtpSend(transport, email);
        return;
      }
      return devModeSendAsync(email, options);
    });
  };
}.call(this, module);
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"nodemailer":{"package.json":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// node_modules/meteor/email/node_modules/nodemailer/package.json                                                   //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
module.exports = {
  "name": "nodemailer",
  "version": "6.6.3",
  "main": "lib/nodemailer.js"
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"lib":{"nodemailer.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// node_modules/meteor/email/node_modules/nodemailer/lib/nodemailer.js                                              //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"well-known":{"index.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// node_modules/meteor/email/node_modules/nodemailer/lib/well-known/index.js                                        //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
module.useNode();
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/email/email.js");

/* Exports */
Package._define("email", exports, {
  Email: Email,
  EmailInternals: EmailInternals,
  EmailTest: EmailTest
});

})();

//# sourceURL=meteor://💻app/packages/email.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZW1haWwvZW1haWwuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZTEiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJleHBvcnQiLCJFbWFpbCIsIkVtYWlsVGVzdCIsIkVtYWlsSW50ZXJuYWxzIiwiTWV0ZW9yIiwiTG9nIiwiSG9vayIsInVybCIsIm5vZGVtYWlsZXIiLCJ3ZWxsS25vdyIsIk5wbU1vZHVsZXMiLCJtYWlsY29tcG9zZXIiLCJ2ZXJzaW9uIiwiTnBtIiwicmVxdWlyZSIsIm1vZHVsZSIsIk1haWxDb21wb3NlciIsIm1ha2VUcmFuc3BvcnQiLCJtYWlsVXJsU3RyaW5nIiwibWFpbFVybCIsIlVSTCIsInByb3RvY29sIiwiRXJyb3IiLCJwb3J0IiwiZGVidWciLCJxdWVyeSIsInBvb2wiLCJ0cmFuc3BvcnQiLCJjcmVhdGVUcmFuc3BvcnQiLCJmb3JtYXQiLCJfc3luY1NlbmRNYWlsIiwid3JhcEFzeW5jIiwic2VuZE1haWwiLCJrbm93bkhvc3RzVHJhbnNwb3J0Iiwic2V0dGluZ3MiLCJ1bmRlZmluZWQiLCJzZXJ2aWNlIiwidXNlciIsInBhc3N3b3JkIiwiaGFzU2V0dGluZ3MiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwiaG9zdCIsInNwbGl0IiwidXJsT2JqZWN0IiwiaG9zdG5hbWUiLCJ1c2VybmFtZSIsInRlbXAiLCJwYXRobmFtZSIsInN1YnN0cmluZyIsInRlbXAyIiwiYXV0aCIsInBhc3MiLCJrbm93SG9zdHNUcmFuc3BvcnQiLCJnZXRUcmFuc3BvcnQiLCJwYWNrYWdlU2V0dGluZ3MiLCJwYWNrYWdlcyIsImVtYWlsIiwicHJvY2VzcyIsImVudiIsIk1BSUxfVVJMIiwiY2FjaGVLZXkiLCJjYWNoZSIsIm5leHREZXZNb2RlTWFpbElkIiwiX2dldEFuZEluY05leHREZXZNb2RlTWFpbElkIiwicmVzZXROZXh0RGV2TW9kZU1haWxJZCIsImRldk1vZGVTZW5kQXN5bmMiLCJtYWlsIiwib3B0aW9ucyIsInN0cmVhbSIsInN0ZG91dCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZGV2TW9kZU1haWxJZCIsIm91dHB1dCIsInB1c2giLCJyZWFkU3RyZWFtIiwiY29tcGlsZSIsImNyZWF0ZVJlYWRTdHJlYW0iLCJvbiIsImJ1ZmZlciIsInRvU3RyaW5nIiwid3JpdGUiLCJqb2luIiwiZXJyIiwic210cFNlbmQiLCJzZW5kSG9va3MiLCJob29rU2VuZCIsImYiLCJyZWdpc3RlciIsImN1c3RvbVRyYW5zcG9ydCIsInNlbmQiLCJtYWlsQ29tcG9zZXIiLCJmb3JFYWNoIiwiaG9vayIsImF3YWl0Iiwic2VuZEFzeW5jIiwibWFpbFVybEVudiIsIm1haWxVcmxTZXR0aW5ncyIsImlzUHJvZHVjdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBQUEsSUFBSUEsYUFBYTtFQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQyxzQ0FBc0MsRUFBQztJQUFDQyxPQUFPLENBQUNDLENBQUMsRUFBQztNQUFDSixhQUFhLEdBQUNJLENBQUM7SUFBQTtFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7RUFBdEdILE9BQU8sQ0FBQ0ksTUFBTSxDQUFDO0lBQUNDLEtBQUssRUFBQyxNQUFJQSxLQUFLO0lBQUNDLFNBQVMsRUFBQyxNQUFJQSxTQUFTO0lBQUNDLGNBQWMsRUFBQyxNQUFJQTtFQUFjLENBQUMsQ0FBQztFQUFDLElBQUlDLE1BQU07RUFBQ1IsT0FBTyxDQUFDQyxJQUFJLENBQUMsZUFBZSxFQUFDO0lBQUNPLE1BQU0sQ0FBQ0wsQ0FBQyxFQUFDO01BQUNLLE1BQU0sR0FBQ0wsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlNLEdBQUc7RUFBQ1QsT0FBTyxDQUFDQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUM7SUFBQ1EsR0FBRyxDQUFDTixDQUFDLEVBQUM7TUFBQ00sR0FBRyxHQUFDTixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQUMsSUFBSU8sSUFBSTtFQUFDVixPQUFPLENBQUNDLElBQUksQ0FBQyxzQkFBc0IsRUFBQztJQUFDUyxJQUFJLENBQUNQLENBQUMsRUFBQztNQUFDTyxJQUFJLEdBQUNQLENBQUM7SUFBQTtFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7RUFBQyxJQUFJUSxHQUFHO0VBQUNYLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDLEtBQUssRUFBQztJQUFDQyxPQUFPLENBQUNDLENBQUMsRUFBQztNQUFDUSxHQUFHLEdBQUNSLENBQUM7SUFBQTtFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7RUFBQyxJQUFJUyxVQUFVO0VBQUNaLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDLFlBQVksRUFBQztJQUFDQyxPQUFPLENBQUNDLENBQUMsRUFBQztNQUFDUyxVQUFVLEdBQUNULENBQUM7SUFBQTtFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7RUFBQyxJQUFJVSxRQUFRO0VBQUNiLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDLDJCQUEyQixFQUFDO0lBQUNDLE9BQU8sQ0FBQ0MsQ0FBQyxFQUFDO01BQUNVLFFBQVEsR0FBQ1YsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQVEzZCxNQUFNRSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0VBQ2hCLE1BQU1DLFNBQVMsR0FBRyxDQUFDLENBQUM7RUFFcEIsTUFBTUMsY0FBYyxHQUFHO0lBQzVCTyxVQUFVLEVBQUU7TUFDVkMsWUFBWSxFQUFFO1FBQ1pDLE9BQU8sRUFBRUMsR0FBRyxDQUFDQyxPQUFPLENBQUMseUJBQXlCLENBQUMsQ0FBQ0YsT0FBTztRQUN2REcsTUFBTSxFQUFFRixHQUFHLENBQUNDLE9BQU8sQ0FBQyw4QkFBOEI7TUFDcEQsQ0FBQztNQUNETixVQUFVLEVBQUU7UUFDVkksT0FBTyxFQUFFQyxHQUFHLENBQUNDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDRixPQUFPO1FBQ3ZERyxNQUFNLEVBQUVGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDLFlBQVk7TUFDbEM7SUFDRjtFQUNGLENBQUM7RUFFRCxNQUFNRSxZQUFZLEdBQUdiLGNBQWMsQ0FBQ08sVUFBVSxDQUFDQyxZQUFZLENBQUNJLE1BQU07RUFFbEUsTUFBTUUsYUFBYSxHQUFHLFVBQVVDLGFBQWEsRUFBRTtJQUM3QyxNQUFNQyxPQUFPLEdBQUcsSUFBSUMsR0FBRyxDQUFDRixhQUFhLENBQUM7SUFFdEMsSUFBSUMsT0FBTyxDQUFDRSxRQUFRLEtBQUssT0FBTyxJQUFJRixPQUFPLENBQUNFLFFBQVEsS0FBSyxRQUFRLEVBQUU7TUFDakUsTUFBTSxJQUFJQyxLQUFLLENBQ2IsK0JBQStCLEdBQzdCSixhQUFhLEdBQ2IsNkJBQTZCLENBQ2hDO0lBQ0g7SUFFQSxJQUFJQyxPQUFPLENBQUNFLFFBQVEsS0FBSyxPQUFPLElBQUlGLE9BQU8sQ0FBQ0ksSUFBSSxLQUFLLEtBQUssRUFBRTtNQUMxRGxCLEdBQUcsQ0FBQ21CLEtBQUssQ0FDUCxzQ0FBc0MsR0FDcEMseURBQXlELEdBQ3pELHlDQUF5QyxDQUM1QztJQUNIOztJQUVBO0lBQ0EsSUFBSSxDQUFDTCxPQUFPLENBQUNNLEtBQUssRUFBRTtNQUNsQk4sT0FBTyxDQUFDTSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ3BCO0lBRUEsSUFBSSxDQUFDTixPQUFPLENBQUNNLEtBQUssQ0FBQ0MsSUFBSSxFQUFFO01BQ3ZCUCxPQUFPLENBQUNNLEtBQUssQ0FBQ0MsSUFBSSxHQUFHLE1BQU07SUFDN0I7SUFFQSxNQUFNQyxTQUFTLEdBQUduQixVQUFVLENBQUNvQixlQUFlLENBQUNyQixHQUFHLENBQUNzQixNQUFNLENBQUNWLE9BQU8sQ0FBQyxDQUFDO0lBRWpFUSxTQUFTLENBQUNHLGFBQWEsR0FBRzFCLE1BQU0sQ0FBQzJCLFNBQVMsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUVMLFNBQVMsQ0FBQztJQUN6RSxPQUFPQSxTQUFTO0VBQ2xCLENBQUM7O0VBRUQ7RUFDQSxNQUFNTSxtQkFBbUIsR0FBRyxZQUFpRDtJQUFBLElBQXZDQyxRQUFRLHVFQUFHQyxTQUFTO0lBQUEsSUFBRTVCLEdBQUcsdUVBQUc0QixTQUFTO0lBQ3pFLElBQUlDLE9BQU8sRUFBRUMsSUFBSSxFQUFFQyxRQUFRO0lBRTNCLE1BQU1DLFdBQVcsR0FBR0wsUUFBUSxJQUFJTSxNQUFNLENBQUNDLElBQUksQ0FBQ1AsUUFBUSxDQUFDLENBQUNRLE1BQU07SUFFNUQsSUFBSW5DLEdBQUcsSUFBSSxDQUFDZ0MsV0FBVyxFQUFFO01BQ3ZCLElBQUlJLElBQUksR0FBR3BDLEdBQUcsQ0FBQ3FDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDNUIsTUFBTUMsU0FBUyxHQUFHLElBQUl6QixHQUFHLENBQUNiLEdBQUcsQ0FBQztNQUM5QixJQUFJb0MsSUFBSSxLQUFLLE1BQU0sSUFBSUEsSUFBSSxLQUFLLE9BQU8sRUFBRTtRQUN2QztRQUNBQSxJQUFJLEdBQUdFLFNBQVMsQ0FBQ0MsUUFBUTtRQUN6QlQsSUFBSSxHQUFHUSxTQUFTLENBQUNFLFFBQVE7UUFDekJULFFBQVEsR0FBR08sU0FBUyxDQUFDUCxRQUFRO01BQy9CLENBQUMsTUFBTSxJQUFJTyxTQUFTLENBQUN4QixRQUFRLElBQUl3QixTQUFTLENBQUNFLFFBQVEsSUFBSUYsU0FBUyxDQUFDUCxRQUFRLEVBQUU7UUFDekU7UUFDQUssSUFBSSxHQUFHRSxTQUFTLENBQUN4QixRQUFRLENBQUN1QixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDUCxJQUFJLEdBQUdRLFNBQVMsQ0FBQ0UsUUFBUTtRQUN6QlQsUUFBUSxHQUFHTyxTQUFTLENBQUNQLFFBQVE7TUFDL0IsQ0FBQyxNQUFNO1FBQUE7UUFDTDtRQUNBO1FBQ0EsTUFBTVUsSUFBSSw0QkFBR0gsU0FBUyxDQUFDSSxRQUFRLENBQUNDLFNBQVMsQ0FBQyxDQUFDLENBQUMsMERBQS9CLHNCQUFpQ04sS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUN4RFAsSUFBSSxHQUFHVyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2Q7UUFDQSxNQUFNRyxLQUFLLEdBQUdILElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQ0osS0FBSyxDQUFDLEdBQUcsQ0FBQztRQUNoQ04sUUFBUSxHQUFHYSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ25CUixJQUFJLEdBQUdRLEtBQUssQ0FBQyxDQUFDLENBQUM7TUFDakI7TUFDQWYsT0FBTyxHQUFHTyxJQUFJO0lBQ2hCO0lBRUEsSUFBSSxDQUFDbEMsUUFBUSxDQUFDLENBQUF5QixRQUFRLGFBQVJBLFFBQVEsdUJBQVJBLFFBQVEsQ0FBRUUsT0FBTyxLQUFJQSxPQUFPLENBQUMsRUFBRTtNQUMzQyxNQUFNLElBQUlkLEtBQUssQ0FDYixxSUFBcUksQ0FDdEk7SUFDSDtJQUVBLE1BQU1LLFNBQVMsR0FBR25CLFVBQVUsQ0FBQ29CLGVBQWUsQ0FBQztNQUMzQ1EsT0FBTyxFQUFFLENBQUFGLFFBQVEsYUFBUkEsUUFBUSx1QkFBUkEsUUFBUSxDQUFFRSxPQUFPLEtBQUlBLE9BQU87TUFDckNnQixJQUFJLEVBQUU7UUFDSmYsSUFBSSxFQUFFLENBQUFILFFBQVEsYUFBUkEsUUFBUSx1QkFBUkEsUUFBUSxDQUFFRyxJQUFJLEtBQUlBLElBQUk7UUFDNUJnQixJQUFJLEVBQUUsQ0FBQW5CLFFBQVEsYUFBUkEsUUFBUSx1QkFBUkEsUUFBUSxDQUFFSSxRQUFRLEtBQUlBO01BQzlCO0lBQ0YsQ0FBQyxDQUFDO0lBRUZYLFNBQVMsQ0FBQ0csYUFBYSxHQUFHMUIsTUFBTSxDQUFDMkIsU0FBUyxDQUFDSixTQUFTLENBQUNLLFFBQVEsRUFBRUwsU0FBUyxDQUFDO0lBQ3pFLE9BQU9BLFNBQVM7RUFDbEIsQ0FBQztFQUNEekIsU0FBUyxDQUFDb0Qsa0JBQWtCLEdBQUdyQixtQkFBbUI7RUFFbEQsTUFBTXNCLFlBQVksR0FBRyxZQUFZO0lBQUE7SUFDL0IsTUFBTUMsZUFBZSxHQUFHLDBCQUFBcEQsTUFBTSxDQUFDOEIsUUFBUSxDQUFDdUIsUUFBUSwwREFBeEIsc0JBQTBCQyxLQUFLLEtBQUksQ0FBQyxDQUFDO0lBQzdEO0lBQ0E7SUFDQTtJQUNBLE1BQU1uRCxHQUFHLEdBQUdvRCxPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsUUFBUTtJQUNoQyxJQUNFLElBQUksQ0FBQ0MsUUFBUSxLQUFLM0IsU0FBUyxJQUMzQixJQUFJLENBQUMyQixRQUFRLEtBQUt2RCxHQUFHLElBQ3JCLElBQUksQ0FBQ3VELFFBQVEsS0FBS04sZUFBZSxDQUFDcEIsT0FBTyxJQUN6QyxJQUFJLENBQUMwQixRQUFRLEtBQUssVUFBVSxFQUM1QjtNQUNBLElBQ0dOLGVBQWUsQ0FBQ3BCLE9BQU8sSUFBSTNCLFFBQVEsQ0FBQytDLGVBQWUsQ0FBQ3BCLE9BQU8sQ0FBQyxJQUM1RDdCLEdBQUcsSUFBSUUsUUFBUSxDQUFDLElBQUlXLEdBQUcsQ0FBQ2IsR0FBRyxDQUFDLENBQUN1QyxRQUFRLENBQUUsSUFDeENyQyxRQUFRLENBQUMsQ0FBQUYsR0FBRyxhQUFIQSxHQUFHLHVCQUFIQSxHQUFHLENBQUVxQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUksRUFBRSxDQUFDLEVBQ2xDO1FBQ0EsSUFBSSxDQUFDa0IsUUFBUSxHQUFHTixlQUFlLENBQUNwQixPQUFPLElBQUksVUFBVTtRQUNyRCxJQUFJLENBQUMyQixLQUFLLEdBQUc5QixtQkFBbUIsQ0FBQ3VCLGVBQWUsRUFBRWpELEdBQUcsQ0FBQztNQUN4RCxDQUFDLE1BQU07UUFDTCxJQUFJLENBQUN1RCxRQUFRLEdBQUd2RCxHQUFHO1FBQ25CLElBQUksQ0FBQ3dELEtBQUssR0FBR3hELEdBQUcsR0FBR1UsYUFBYSxDQUFDVixHQUFHLEVBQUVpRCxlQUFlLENBQUMsR0FBRyxJQUFJO01BQy9EO0lBQ0Y7SUFDQSxPQUFPLElBQUksQ0FBQ08sS0FBSztFQUNuQixDQUFDO0VBRUQsSUFBSUMsaUJBQWlCLEdBQUcsQ0FBQztFQUV6QjlELFNBQVMsQ0FBQytELDJCQUEyQixHQUFHLFlBQVk7SUFDbEQsT0FBT0QsaUJBQWlCLEVBQUU7RUFDNUIsQ0FBQzs7RUFFRDtFQUNBOUQsU0FBUyxDQUFDZ0Usc0JBQXNCLEdBQUcsWUFBWTtJQUM3Q0YsaUJBQWlCLEdBQUcsQ0FBQztFQUN2QixDQUFDO0VBRUQsTUFBTUcsZ0JBQWdCLEdBQUcsVUFBVUMsSUFBSSxFQUFFQyxPQUFPLEVBQUU7SUFDaEQsTUFBTUMsTUFBTSxHQUFHLENBQUFELE9BQU8sYUFBUEEsT0FBTyx1QkFBUEEsT0FBTyxDQUFFQyxNQUFNLEtBQUlYLE9BQU8sQ0FBQ1ksTUFBTTtJQUNoRCxPQUFPLElBQUlDLE9BQU8sQ0FBQyxDQUFDQyxPQUFPLEVBQUVDLE1BQU0sS0FBSztNQUN0QyxJQUFJQyxhQUFhLEdBQUd6RSxTQUFTLENBQUMrRCwyQkFBMkIsRUFBRTs7TUFFM0Q7TUFDQSxNQUFNVyxNQUFNLEdBQUcsQ0FBQyxxQkFBcUIsR0FBR0QsYUFBYSxHQUFHLFdBQVcsQ0FBQztNQUNwRUMsTUFBTSxDQUFDQyxJQUFJLENBQ1Qsc0RBQXNELEdBQ3RELDBCQUEwQixDQUMzQjtNQUNELE1BQU1DLFVBQVUsR0FBRyxJQUFJOUQsWUFBWSxDQUFDb0QsSUFBSSxDQUFDLENBQUNXLE9BQU8sRUFBRSxDQUFDQyxnQkFBZ0IsRUFBRTtNQUN0RUYsVUFBVSxDQUFDRyxFQUFFLENBQUMsTUFBTSxFQUFFQyxNQUFNLElBQUk7UUFDOUJOLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSyxNQUFNLENBQUNDLFFBQVEsRUFBRSxDQUFDO01BQ2hDLENBQUMsQ0FBQztNQUNGTCxVQUFVLENBQUNHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsWUFBWTtRQUMvQkwsTUFBTSxDQUFDQyxJQUFJLENBQUMsbUJBQW1CLEdBQUdGLGFBQWEsR0FBRyxXQUFXLENBQUM7UUFDOURMLE1BQU0sQ0FBQ2MsS0FBSyxDQUFDUixNQUFNLENBQUNTLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNWixPQUFPLEVBQUUsQ0FBQztNQUNoRCxDQUFDLENBQUM7TUFDRkssVUFBVSxDQUFDRyxFQUFFLENBQUMsT0FBTyxFQUFHSyxHQUFHLElBQUtaLE1BQU0sQ0FBQ1ksR0FBRyxDQUFDLENBQUM7SUFDOUMsQ0FBQyxDQUFDO0VBQ0osQ0FBQztFQUVELE1BQU1DLFFBQVEsR0FBRyxVQUFVNUQsU0FBUyxFQUFFeUMsSUFBSSxFQUFFO0lBQzFDekMsU0FBUyxDQUFDRyxhQUFhLENBQUNzQyxJQUFJLENBQUM7RUFDL0IsQ0FBQztFQUVELE1BQU1vQixTQUFTLEdBQUcsSUFBSWxGLElBQUksRUFBRTs7RUFFNUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0FMLEtBQUssQ0FBQ3dGLFFBQVEsR0FBRyxVQUFVQyxDQUFDLEVBQUU7SUFDNUIsT0FBT0YsU0FBUyxDQUFDRyxRQUFRLENBQUNELENBQUMsQ0FBQztFQUM5QixDQUFDOztFQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0F6RixLQUFLLENBQUMyRixlQUFlLEdBQUd6RCxTQUFTOztFQUVqQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0FsQyxLQUFLLENBQUM0RixJQUFJLEdBQUcsVUFBVXhCLE9BQU8sRUFBRTtJQUM5QixJQUFJcEUsS0FBSyxDQUFDMkYsZUFBZSxFQUFFO01BQUE7TUFDekI7TUFDQSxNQUFNbEMsS0FBSyxHQUFHVyxPQUFPLENBQUN5QixZQUFZLEdBQUd6QixPQUFPLENBQUN5QixZQUFZLENBQUMxQixJQUFJLEdBQUdDLE9BQU87TUFDeEUsSUFBSXdCLElBQUksR0FBRyxJQUFJO01BQ2ZMLFNBQVMsQ0FBQ08sT0FBTyxDQUFFQyxJQUFJLElBQUs7UUFDMUJILElBQUksR0FBR0csSUFBSSxDQUFDdEMsS0FBSyxDQUFDO1FBQ2xCLE9BQU9tQyxJQUFJO01BQ2IsQ0FBQyxDQUFDO01BQ0YsSUFBSSxDQUFDQSxJQUFJLEVBQUU7UUFDVDtNQUNGO01BQ0EsTUFBTXJDLGVBQWUsR0FBRywyQkFBQXBELE1BQU0sQ0FBQzhCLFFBQVEsQ0FBQ3VCLFFBQVEsMkRBQXhCLHVCQUEwQkMsS0FBSyxLQUFJLENBQUMsQ0FBQztNQUM3RHpELEtBQUssQ0FBQzJGLGVBQWU7UUFBR3BDO01BQWUsR0FBS0UsS0FBSyxFQUFHO01BQ3BEO0lBQ0Y7SUFDQTtJQUNBLE9BQU9jLE9BQU8sQ0FBQ3lCLEtBQUssQ0FBQ2hHLEtBQUssQ0FBQ2lHLFNBQVMsQ0FBQzdCLE9BQU8sQ0FBQyxDQUFDO0VBQ2hELENBQUM7O0VBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0FwRSxLQUFLLENBQUNpRyxTQUFTLEdBQUcsVUFBZ0I3QixPQUFPO0lBQUEsZ0NBQUU7TUFBQTtNQUV6QyxNQUFNWCxLQUFLLEdBQUdXLE9BQU8sQ0FBQ3lCLFlBQVksR0FBR3pCLE9BQU8sQ0FBQ3lCLFlBQVksQ0FBQzFCLElBQUksR0FBR0MsT0FBTztNQUV4RSxJQUFJd0IsSUFBSSxHQUFHLElBQUk7TUFDZkwsU0FBUyxDQUFDTyxPQUFPLENBQUVDLElBQUksSUFBSztRQUMxQkgsSUFBSSxHQUFHRyxJQUFJLENBQUN0QyxLQUFLLENBQUM7UUFDbEIsT0FBT21DLElBQUk7TUFDYixDQUFDLENBQUM7TUFDRixJQUFJLENBQUNBLElBQUksRUFBRTtRQUNUO01BQ0Y7TUFFQSxJQUFJNUYsS0FBSyxDQUFDMkYsZUFBZSxFQUFFO1FBQUE7UUFDekIsTUFBTXBDLGVBQWUsR0FBRywyQkFBQXBELE1BQU0sQ0FBQzhCLFFBQVEsQ0FBQ3VCLFFBQVEsMkRBQXhCLHVCQUEwQkMsS0FBSyxLQUFJLENBQUMsQ0FBQztRQUM3RCxPQUFPekQsS0FBSyxDQUFDMkYsZUFBZTtVQUFHcEM7UUFBZSxHQUFLRSxLQUFLLEVBQUc7TUFDN0Q7TUFFQSxNQUFNeUMsVUFBVSxHQUFHeEMsT0FBTyxDQUFDQyxHQUFHLENBQUNDLFFBQVE7TUFDdkMsTUFBTXVDLGVBQWUsNkJBQUdoRyxNQUFNLENBQUM4QixRQUFRLENBQUN1QixRQUFRLDJEQUF4Qix1QkFBMEJDLEtBQUs7TUFFdkQsSUFBSXRELE1BQU0sQ0FBQ2lHLFlBQVksSUFBSSxDQUFDRixVQUFVLElBQUksQ0FBQ0MsZUFBZSxFQUFFO1FBQzFEO1FBQ0E7UUFDQSxNQUFNLElBQUk5RSxLQUFLLENBQ2IsNExBQTRMLENBQzdMO01BQ0g7TUFFQSxJQUFJNkUsVUFBVSxJQUFJQyxlQUFlLEVBQUU7UUFDakMsTUFBTXpFLFNBQVMsR0FBRzRCLFlBQVksRUFBRTtRQUNoQ2dDLFFBQVEsQ0FBQzVELFNBQVMsRUFBRStCLEtBQUssQ0FBQztRQUMxQjtNQUNGO01BQ0EsT0FBT1MsZ0JBQWdCLENBQUNULEtBQUssRUFBRVcsT0FBTyxDQUFDO0lBQ3pDLENBQUM7RUFBQTtBQUFDLHFCIiwiZmlsZSI6Ii9wYWNrYWdlcy9lbWFpbC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgTG9nIH0gZnJvbSAnbWV0ZW9yL2xvZ2dpbmcnO1xuaW1wb3J0IHsgSG9vayB9IGZyb20gJ21ldGVvci9jYWxsYmFjay1ob29rJztcblxuaW1wb3J0IHVybCBmcm9tICd1cmwnO1xuaW1wb3J0IG5vZGVtYWlsZXIgZnJvbSAnbm9kZW1haWxlcic7XG5pbXBvcnQgd2VsbEtub3cgZnJvbSAnbm9kZW1haWxlci9saWIvd2VsbC1rbm93bic7XG5cbmV4cG9ydCBjb25zdCBFbWFpbCA9IHt9O1xuZXhwb3J0IGNvbnN0IEVtYWlsVGVzdCA9IHt9O1xuXG5leHBvcnQgY29uc3QgRW1haWxJbnRlcm5hbHMgPSB7XG4gIE5wbU1vZHVsZXM6IHtcbiAgICBtYWlsY29tcG9zZXI6IHtcbiAgICAgIHZlcnNpb246IE5wbS5yZXF1aXJlKCdub2RlbWFpbGVyL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG4gICAgICBtb2R1bGU6IE5wbS5yZXF1aXJlKCdub2RlbWFpbGVyL2xpYi9tYWlsLWNvbXBvc2VyJyksXG4gICAgfSxcbiAgICBub2RlbWFpbGVyOiB7XG4gICAgICB2ZXJzaW9uOiBOcG0ucmVxdWlyZSgnbm9kZW1haWxlci9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuICAgICAgbW9kdWxlOiBOcG0ucmVxdWlyZSgnbm9kZW1haWxlcicpLFxuICAgIH0sXG4gIH0sXG59O1xuXG5jb25zdCBNYWlsQ29tcG9zZXIgPSBFbWFpbEludGVybmFscy5OcG1Nb2R1bGVzLm1haWxjb21wb3Nlci5tb2R1bGU7XG5cbmNvbnN0IG1ha2VUcmFuc3BvcnQgPSBmdW5jdGlvbiAobWFpbFVybFN0cmluZykge1xuICBjb25zdCBtYWlsVXJsID0gbmV3IFVSTChtYWlsVXJsU3RyaW5nKTtcblxuICBpZiAobWFpbFVybC5wcm90b2NvbCAhPT0gJ3NtdHA6JyAmJiBtYWlsVXJsLnByb3RvY29sICE9PSAnc210cHM6Jykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICdFbWFpbCBwcm90b2NvbCBpbiAkTUFJTF9VUkwgKCcgK1xuICAgICAgICBtYWlsVXJsU3RyaW5nICtcbiAgICAgICAgXCIpIG11c3QgYmUgJ3NtdHAnIG9yICdzbXRwcydcIlxuICAgICk7XG4gIH1cblxuICBpZiAobWFpbFVybC5wcm90b2NvbCA9PT0gJ3NtdHA6JyAmJiBtYWlsVXJsLnBvcnQgPT09ICc0NjUnKSB7XG4gICAgTG9nLmRlYnVnKFxuICAgICAgXCJUaGUgJE1BSUxfVVJMIGlzICdzbXRwOi8vLi4uOjQ2NScuICBcIiArXG4gICAgICAgIFwiWW91IHByb2JhYmx5IHdhbnQgJ3NtdHBzOi8vJyAoVGhlICdzJyBlbmFibGVzIFRMUy9TU0wpIFwiICtcbiAgICAgICAgXCJzaW5jZSAnNDY1JyBpcyB0eXBpY2FsbHkgYSBzZWN1cmUgcG9ydC5cIlxuICAgICk7XG4gIH1cblxuICAvLyBBbGxvdyBvdmVycmlkaW5nIHBvb2wgc2V0dGluZywgYnV0IGRlZmF1bHQgdG8gdHJ1ZS5cbiAgaWYgKCFtYWlsVXJsLnF1ZXJ5KSB7XG4gICAgbWFpbFVybC5xdWVyeSA9IHt9O1xuICB9XG5cbiAgaWYgKCFtYWlsVXJsLnF1ZXJ5LnBvb2wpIHtcbiAgICBtYWlsVXJsLnF1ZXJ5LnBvb2wgPSAndHJ1ZSc7XG4gIH1cblxuICBjb25zdCB0cmFuc3BvcnQgPSBub2RlbWFpbGVyLmNyZWF0ZVRyYW5zcG9ydCh1cmwuZm9ybWF0KG1haWxVcmwpKTtcblxuICB0cmFuc3BvcnQuX3N5bmNTZW5kTWFpbCA9IE1ldGVvci53cmFwQXN5bmModHJhbnNwb3J0LnNlbmRNYWlsLCB0cmFuc3BvcnQpO1xuICByZXR1cm4gdHJhbnNwb3J0O1xufTtcblxuLy8gTW9yZSBpbmZvOiBodHRwczovL25vZGVtYWlsZXIuY29tL3NtdHAvd2VsbC1rbm93bi9cbmNvbnN0IGtub3duSG9zdHNUcmFuc3BvcnQgPSBmdW5jdGlvbiAoc2V0dGluZ3MgPSB1bmRlZmluZWQsIHVybCA9IHVuZGVmaW5lZCkge1xuICBsZXQgc2VydmljZSwgdXNlciwgcGFzc3dvcmQ7XG5cbiAgY29uc3QgaGFzU2V0dGluZ3MgPSBzZXR0aW5ncyAmJiBPYmplY3Qua2V5cyhzZXR0aW5ncykubGVuZ3RoO1xuXG4gIGlmICh1cmwgJiYgIWhhc1NldHRpbmdzKSB7XG4gICAgbGV0IGhvc3QgPSB1cmwuc3BsaXQoJzonKVswXTtcbiAgICBjb25zdCB1cmxPYmplY3QgPSBuZXcgVVJMKHVybCk7XG4gICAgaWYgKGhvc3QgPT09ICdodHRwJyB8fCBob3N0ID09PSAnaHR0cHMnKSB7XG4gICAgICAvLyBMb29rIHRvIGhvc3RuYW1lIGZvciBzZXJ2aWNlXG4gICAgICBob3N0ID0gdXJsT2JqZWN0Lmhvc3RuYW1lO1xuICAgICAgdXNlciA9IHVybE9iamVjdC51c2VybmFtZTtcbiAgICAgIHBhc3N3b3JkID0gdXJsT2JqZWN0LnBhc3N3b3JkO1xuICAgIH0gZWxzZSBpZiAodXJsT2JqZWN0LnByb3RvY29sICYmIHVybE9iamVjdC51c2VybmFtZSAmJiB1cmxPYmplY3QucGFzc3dvcmQpIHtcbiAgICAgIC8vIFdlIGhhdmUgc29tZSBkYXRhIGZyb20gdXJsT2JqZWN0XG4gICAgICBob3N0ID0gdXJsT2JqZWN0LnByb3RvY29sLnNwbGl0KCc6JylbMF07XG4gICAgICB1c2VyID0gdXJsT2JqZWN0LnVzZXJuYW1lO1xuICAgICAgcGFzc3dvcmQgPSB1cmxPYmplY3QucGFzc3dvcmQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFdlIG5lZWQgdG8gZGlzZWN0IHRoZSBVUkwgb3Vyc2VsdmVzIHRvIGdldCB0aGUgZGF0YVxuICAgICAgLy8gRmlyc3QgZ2V0IHJpZCBvZiB0aGUgbGVhZGluZyAnLy8nIGFuZCBzcGxpdCB0byB1c2VybmFtZSBhbmQgdGhlIHJlc3RcbiAgICAgIGNvbnN0IHRlbXAgPSB1cmxPYmplY3QucGF0aG5hbWUuc3Vic3RyaW5nKDIpPy5zcGxpdCgnOicpO1xuICAgICAgdXNlciA9IHRlbXBbMF07XG4gICAgICAvLyBOb3cgd2Ugc3BsaXQgYnkgJ0AnIHRvIGdldCBwYXNzd29yZCBhbmQgaG9zdG5hbWVcbiAgICAgIGNvbnN0IHRlbXAyID0gdGVtcFsxXS5zcGxpdCgnQCcpO1xuICAgICAgcGFzc3dvcmQgPSB0ZW1wMlswXTtcbiAgICAgIGhvc3QgPSB0ZW1wMlsxXTtcbiAgICB9XG4gICAgc2VydmljZSA9IGhvc3Q7XG4gIH1cblxuICBpZiAoIXdlbGxLbm93KHNldHRpbmdzPy5zZXJ2aWNlIHx8IHNlcnZpY2UpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ0NvdWxkIG5vdCByZWNvZ25pemUgZS1tYWlsIHNlcnZpY2UuIFNlZSBsaXN0IGF0IGh0dHBzOi8vbm9kZW1haWxlci5jb20vc210cC93ZWxsLWtub3duLyBmb3Igc2VydmljZXMgdGhhdCB3ZSBjYW4gY29uZmlndXJlIGZvciB5b3UuJ1xuICAgICk7XG4gIH1cblxuICBjb25zdCB0cmFuc3BvcnQgPSBub2RlbWFpbGVyLmNyZWF0ZVRyYW5zcG9ydCh7XG4gICAgc2VydmljZTogc2V0dGluZ3M/LnNlcnZpY2UgfHwgc2VydmljZSxcbiAgICBhdXRoOiB7XG4gICAgICB1c2VyOiBzZXR0aW5ncz8udXNlciB8fCB1c2VyLFxuICAgICAgcGFzczogc2V0dGluZ3M/LnBhc3N3b3JkIHx8IHBhc3N3b3JkLFxuICAgIH0sXG4gIH0pO1xuXG4gIHRyYW5zcG9ydC5fc3luY1NlbmRNYWlsID0gTWV0ZW9yLndyYXBBc3luYyh0cmFuc3BvcnQuc2VuZE1haWwsIHRyYW5zcG9ydCk7XG4gIHJldHVybiB0cmFuc3BvcnQ7XG59O1xuRW1haWxUZXN0Lmtub3dIb3N0c1RyYW5zcG9ydCA9IGtub3duSG9zdHNUcmFuc3BvcnQ7XG5cbmNvbnN0IGdldFRyYW5zcG9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgcGFja2FnZVNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy5lbWFpbCB8fCB7fTtcbiAgLy8gV2UgZGVsYXkgdGhpcyBjaGVjayB1bnRpbCB0aGUgZmlyc3QgY2FsbCB0byBFbWFpbC5zZW5kLCBpbiBjYXNlIHNvbWVvbmVcbiAgLy8gc2V0IHByb2Nlc3MuZW52Lk1BSUxfVVJMIGluIHN0YXJ0dXAgY29kZS4gVGhlbiB3ZSBzdG9yZSBpbiBhIGNhY2hlIHVudGlsXG4gIC8vIHByb2Nlc3MuZW52Lk1BSUxfVVJMIGNoYW5nZXMuXG4gIGNvbnN0IHVybCA9IHByb2Nlc3MuZW52Lk1BSUxfVVJMO1xuICBpZiAoXG4gICAgdGhpcy5jYWNoZUtleSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgdGhpcy5jYWNoZUtleSAhPT0gdXJsIHx8XG4gICAgdGhpcy5jYWNoZUtleSAhPT0gcGFja2FnZVNldHRpbmdzLnNlcnZpY2UgfHxcbiAgICB0aGlzLmNhY2hlS2V5ICE9PSAnc2V0dGluZ3MnXG4gICkge1xuICAgIGlmIChcbiAgICAgIChwYWNrYWdlU2V0dGluZ3Muc2VydmljZSAmJiB3ZWxsS25vdyhwYWNrYWdlU2V0dGluZ3Muc2VydmljZSkpIHx8XG4gICAgICAodXJsICYmIHdlbGxLbm93KG5ldyBVUkwodXJsKS5ob3N0bmFtZSkpIHx8XG4gICAgICB3ZWxsS25vdyh1cmw/LnNwbGl0KCc6JylbMF0gfHwgJycpXG4gICAgKSB7XG4gICAgICB0aGlzLmNhY2hlS2V5ID0gcGFja2FnZVNldHRpbmdzLnNlcnZpY2UgfHwgJ3NldHRpbmdzJztcbiAgICAgIHRoaXMuY2FjaGUgPSBrbm93bkhvc3RzVHJhbnNwb3J0KHBhY2thZ2VTZXR0aW5ncywgdXJsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jYWNoZUtleSA9IHVybDtcbiAgICAgIHRoaXMuY2FjaGUgPSB1cmwgPyBtYWtlVHJhbnNwb3J0KHVybCwgcGFja2FnZVNldHRpbmdzKSA6IG51bGw7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzLmNhY2hlO1xufTtcblxubGV0IG5leHREZXZNb2RlTWFpbElkID0gMDtcblxuRW1haWxUZXN0Ll9nZXRBbmRJbmNOZXh0RGV2TW9kZU1haWxJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIG5leHREZXZNb2RlTWFpbElkKys7XG59O1xuXG4vLyBUZXN0aW5nIGhvb2tzXG5FbWFpbFRlc3QucmVzZXROZXh0RGV2TW9kZU1haWxJZCA9IGZ1bmN0aW9uICgpIHtcbiAgbmV4dERldk1vZGVNYWlsSWQgPSAwO1xufTtcblxuY29uc3QgZGV2TW9kZVNlbmRBc3luYyA9IGZ1bmN0aW9uIChtYWlsLCBvcHRpb25zKSB7XG4gIGNvbnN0IHN0cmVhbSA9IG9wdGlvbnM/LnN0cmVhbSB8fCBwcm9jZXNzLnN0ZG91dDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBsZXQgZGV2TW9kZU1haWxJZCA9IEVtYWlsVGVzdC5fZ2V0QW5kSW5jTmV4dERldk1vZGVNYWlsSWQoKTtcblxuICAgIC8vIFRoaXMgYXBwcm9hY2ggZG9lcyBub3QgcHJldmVudCBvdGhlciB3cml0ZXJzIHRvIHN0ZG91dCBmcm9tIGludGVybGVhdmluZy5cbiAgICBjb25zdCBvdXRwdXQgPSBbJz09PT09PSBCRUdJTiBNQUlMICMnICsgZGV2TW9kZU1haWxJZCArICcgPT09PT09XFxuJ107XG4gICAgb3V0cHV0LnB1c2goXG4gICAgICAnKE1haWwgbm90IHNlbnQ7IHRvIGVuYWJsZSBzZW5kaW5nLCBzZXQgdGhlIE1BSUxfVVJMICcgK1xuICAgICAgJ2Vudmlyb25tZW50IHZhcmlhYmxlLilcXG4nXG4gICAgKTtcbiAgICBjb25zdCByZWFkU3RyZWFtID0gbmV3IE1haWxDb21wb3NlcihtYWlsKS5jb21waWxlKCkuY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgIHJlYWRTdHJlYW0ub24oJ2RhdGEnLCBidWZmZXIgPT4ge1xuICAgICAgb3V0cHV0LnB1c2goYnVmZmVyLnRvU3RyaW5nKCkpO1xuICAgIH0pO1xuICAgIHJlYWRTdHJlYW0ub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIG91dHB1dC5wdXNoKCc9PT09PT0gRU5EIE1BSUwgIycgKyBkZXZNb2RlTWFpbElkICsgJyA9PT09PT1cXG4nKTtcbiAgICAgIHN0cmVhbS53cml0ZShvdXRwdXQuam9pbignJyksICgpID0+IHJlc29sdmUoKSk7XG4gICAgfSk7XG4gICAgcmVhZFN0cmVhbS5vbignZXJyb3InLCAoZXJyKSA9PiByZWplY3QoZXJyKSk7XG4gIH0pO1xufTtcblxuY29uc3Qgc210cFNlbmQgPSBmdW5jdGlvbiAodHJhbnNwb3J0LCBtYWlsKSB7XG4gIHRyYW5zcG9ydC5fc3luY1NlbmRNYWlsKG1haWwpO1xufTtcblxuY29uc3Qgc2VuZEhvb2tzID0gbmV3IEhvb2soKTtcblxuLyoqXG4gKiBAc3VtbWFyeSBIb29rIHRoYXQgcnVucyBiZWZvcmUgZW1haWwgaXMgc2VudC5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqXG4gKiBAcGFyYW0gZiB7ZnVuY3Rpb259IHJlY2VpdmVzIHRoZSBhcmd1bWVudHMgdG8gRW1haWwuc2VuZCBhbmQgc2hvdWxkIHJldHVybiB0cnVlIHRvIGdvXG4gKiBhaGVhZCBhbmQgc2VuZCB0aGUgZW1haWwgKG9yIGF0IGxlYXN0LCB0cnkgc3Vic2VxdWVudCBob29rcyksIG9yXG4gKiBmYWxzZSB0byBza2lwIHNlbmRpbmcuXG4gKiBAcmV0dXJucyB7eyBzdG9wOiBmdW5jdGlvbiwgY2FsbGJhY2s6IGZ1bmN0aW9uIH19XG4gKi9cbkVtYWlsLmhvb2tTZW5kID0gZnVuY3Rpb24gKGYpIHtcbiAgcmV0dXJuIHNlbmRIb29rcy5yZWdpc3RlcihmKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgT3ZlcnJpZGVzIHNlbmRpbmcgZnVuY3Rpb24gd2l0aCB5b3VyIG93bi5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBzaW5jZSAyLjJcbiAqIEBwYXJhbSBmIHtmdW5jdGlvbn0gZnVuY3Rpb24gdGhhdCB3aWxsIHJlY2VpdmUgb3B0aW9ucyBmcm9tIHRoZSBzZW5kIGZ1bmN0aW9uIGFuZCB1bmRlciBgcGFja2FnZVNldHRpbmdzYCB3aWxsXG4gKiBpbmNsdWRlIHRoZSBwYWNrYWdlIHNldHRpbmdzIGZyb20gTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzLmVtYWlsIGZvciB5b3VyIGN1c3RvbSB0cmFuc3BvcnQgdG8gYWNjZXNzLlxuICovXG5FbWFpbC5jdXN0b21UcmFuc3BvcnQgPSB1bmRlZmluZWQ7XG5cbi8qKlxuICogQHN1bW1hcnkgU2VuZCBhbiBlbWFpbC4gVGhyb3dzIGFuIGBFcnJvcmAgb24gZmFpbHVyZSB0byBjb250YWN0IG1haWwgc2VydmVyXG4gKiBvciBpZiBtYWlsIHNlcnZlciByZXR1cm5zIGFuIGVycm9yLiBBbGwgZmllbGRzIHNob3VsZCBtYXRjaFxuICogW1JGQzUzMjJdKGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzUzMjIpIHNwZWNpZmljYXRpb24uXG4gKlxuICogSWYgdGhlIGBNQUlMX1VSTGAgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgc2V0LCBhY3R1YWxseSBzZW5kcyB0aGUgZW1haWwuXG4gKiBPdGhlcndpc2UsIHByaW50cyB0aGUgY29udGVudHMgb2YgdGhlIGVtYWlsIHRvIHN0YW5kYXJkIG91dC5cbiAqXG4gKiBOb3RlIHRoYXQgdGhpcyBwYWNrYWdlIGlzIGJhc2VkIG9uICoqbm9kZW1haWxlcioqLCBzbyBtYWtlIHN1cmUgdG8gcmVmZXIgdG9cbiAqIFt0aGUgZG9jdW1lbnRhdGlvbl0oaHR0cDovL25vZGVtYWlsZXIuY29tLylcbiAqIHdoZW4gdXNpbmcgdGhlIGBhdHRhY2htZW50c2Agb3IgYG1haWxDb21wb3NlcmAgb3B0aW9ucy5cbiAqXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLmZyb21dIFwiRnJvbTpcIiBhZGRyZXNzIChyZXF1aXJlZClcbiAqIEBwYXJhbSB7U3RyaW5nfFN0cmluZ1tdfSBvcHRpb25zLnRvLGNjLGJjYyxyZXBseVRvXG4gKiAgIFwiVG86XCIsIFwiQ2M6XCIsIFwiQmNjOlwiLCBhbmQgXCJSZXBseS1UbzpcIiBhZGRyZXNzZXNcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5pblJlcGx5VG9dIE1lc3NhZ2UtSUQgdGhpcyBtZXNzYWdlIGlzIHJlcGx5aW5nIHRvXG4gKiBAcGFyYW0ge1N0cmluZ3xTdHJpbmdbXX0gW29wdGlvbnMucmVmZXJlbmNlc10gQXJyYXkgKG9yIHNwYWNlLXNlcGFyYXRlZCBzdHJpbmcpIG9mIE1lc3NhZ2UtSURzIHRvIHJlZmVyIHRvXG4gKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMubWVzc2FnZUlkXSBNZXNzYWdlLUlEIGZvciB0aGlzIG1lc3NhZ2U7IG90aGVyd2lzZSwgd2lsbCBiZSBzZXQgdG8gYSByYW5kb20gdmFsdWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5zdWJqZWN0XSAgXCJTdWJqZWN0OlwiIGxpbmVcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy50ZXh0fGh0bWxdIE1haWwgYm9keSAoaW4gcGxhaW4gdGV4dCBhbmQvb3IgSFRNTClcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy53YXRjaEh0bWxdIE1haWwgYm9keSBpbiBIVE1MIHNwZWNpZmljIGZvciBBcHBsZSBXYXRjaFxuICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLmljYWxFdmVudF0gaUNhbGVuZGFyIGV2ZW50IGF0dGFjaG1lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5oZWFkZXJzXSBEaWN0aW9uYXJ5IG9mIGN1c3RvbSBoZWFkZXJzIC0gZS5nLiBgeyBcImhlYWRlciBuYW1lXCI6IFwiaGVhZGVyIHZhbHVlXCIgfWAuIFRvIHNldCBhbiBvYmplY3QgdW5kZXIgYSBoZWFkZXIgbmFtZSwgdXNlIGBKU09OLnN0cmluZ2lmeWAgLSBlLmcuIGB7IFwiaGVhZGVyIG5hbWVcIjogSlNPTi5zdHJpbmdpZnkoeyB0cmFja2luZzogeyBsZXZlbDogJ2Z1bGwnIH0gfSkgfWAuXG4gKiBAcGFyYW0ge09iamVjdFtdfSBbb3B0aW9ucy5hdHRhY2htZW50c10gQXJyYXkgb2YgYXR0YWNobWVudCBvYmplY3RzLCBhc1xuICogZGVzY3JpYmVkIGluIHRoZSBbbm9kZW1haWxlciBkb2N1bWVudGF0aW9uXShodHRwczovL25vZGVtYWlsZXIuY29tL21lc3NhZ2UvYXR0YWNobWVudHMvKS5cbiAqIEBwYXJhbSB7TWFpbENvbXBvc2VyfSBbb3B0aW9ucy5tYWlsQ29tcG9zZXJdIEEgW01haWxDb21wb3Nlcl0oaHR0cHM6Ly9ub2RlbWFpbGVyLmNvbS9leHRyYXMvbWFpbGNvbXBvc2VyLyNlLW1haWwtbWVzc2FnZS1maWVsZHMpXG4gKiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSBtZXNzYWdlIHRvIGJlIHNlbnQuICBPdmVycmlkZXMgYWxsIG90aGVyIG9wdGlvbnMuXG4gKiBZb3UgY2FuIGNyZWF0ZSBhIGBNYWlsQ29tcG9zZXJgIG9iamVjdCB2aWFcbiAqIGBuZXcgRW1haWxJbnRlcm5hbHMuTnBtTW9kdWxlcy5tYWlsY29tcG9zZXIubW9kdWxlYC5cbiAqL1xuRW1haWwuc2VuZCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIGlmIChFbWFpbC5jdXN0b21UcmFuc3BvcnQpIHtcbiAgICAvLyBQcmVzZXJ2ZSBjdXJyZW50IGJlaGF2aW9yXG4gICAgY29uc3QgZW1haWwgPSBvcHRpb25zLm1haWxDb21wb3NlciA/IG9wdGlvbnMubWFpbENvbXBvc2VyLm1haWwgOiBvcHRpb25zO1xuICAgIGxldCBzZW5kID0gdHJ1ZTtcbiAgICBzZW5kSG9va3MuZm9yRWFjaCgoaG9vaykgPT4ge1xuICAgICAgc2VuZCA9IGhvb2soZW1haWwpO1xuICAgICAgcmV0dXJuIHNlbmQ7XG4gICAgfSk7XG4gICAgaWYgKCFzZW5kKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHBhY2thZ2VTZXR0aW5ncyA9IE1ldGVvci5zZXR0aW5ncy5wYWNrYWdlcz8uZW1haWwgfHwge307XG4gICAgRW1haWwuY3VzdG9tVHJhbnNwb3J0KHsgcGFja2FnZVNldHRpbmdzLCAuLi5lbWFpbCB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gVXNpbmcgRmliZXJzIFByb21pc2UuYXdhaXRcbiAgcmV0dXJuIFByb21pc2UuYXdhaXQoRW1haWwuc2VuZEFzeW5jKG9wdGlvbnMpKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgU2VuZCBhbiBlbWFpbCB3aXRoIGFzeW5jcm9ub3VzIG1ldGhvZC4gQ2FwdHVyZSAgVGhyb3dzIGFuIGBFcnJvcmAgb24gZmFpbHVyZSB0byBjb250YWN0IG1haWwgc2VydmVyXG4gKiBvciBpZiBtYWlsIHNlcnZlciByZXR1cm5zIGFuIGVycm9yLiBBbGwgZmllbGRzIHNob3VsZCBtYXRjaFxuICogW1JGQzUzMjJdKGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzUzMjIpIHNwZWNpZmljYXRpb24uXG4gKlxuICogSWYgdGhlIGBNQUlMX1VSTGAgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgc2V0LCBhY3R1YWxseSBzZW5kcyB0aGUgZW1haWwuXG4gKiBPdGhlcndpc2UsIHByaW50cyB0aGUgY29udGVudHMgb2YgdGhlIGVtYWlsIHRvIHN0YW5kYXJkIG91dC5cbiAqXG4gKiBOb3RlIHRoYXQgdGhpcyBwYWNrYWdlIGlzIGJhc2VkIG9uICoqbm9kZW1haWxlcioqLCBzbyBtYWtlIHN1cmUgdG8gcmVmZXIgdG9cbiAqIFt0aGUgZG9jdW1lbnRhdGlvbl0oaHR0cDovL25vZGVtYWlsZXIuY29tLylcbiAqIHdoZW4gdXNpbmcgdGhlIGBhdHRhY2htZW50c2Agb3IgYG1haWxDb21wb3NlcmAgb3B0aW9ucy5cbiAqXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcmV0dXJuIHtQcm9taXNlfVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5mcm9tXSBcIkZyb206XCIgYWRkcmVzcyAocmVxdWlyZWQpXG4gKiBAcGFyYW0ge1N0cmluZ3xTdHJpbmdbXX0gb3B0aW9ucy50byxjYyxiY2MscmVwbHlUb1xuICogICBcIlRvOlwiLCBcIkNjOlwiLCBcIkJjYzpcIiwgYW5kIFwiUmVwbHktVG86XCIgYWRkcmVzc2VzXG4gKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMuaW5SZXBseVRvXSBNZXNzYWdlLUlEIHRoaXMgbWVzc2FnZSBpcyByZXBseWluZyB0b1xuICogQHBhcmFtIHtTdHJpbmd8U3RyaW5nW119IFtvcHRpb25zLnJlZmVyZW5jZXNdIEFycmF5IChvciBzcGFjZS1zZXBhcmF0ZWQgc3RyaW5nKSBvZiBNZXNzYWdlLUlEcyB0byByZWZlciB0b1xuICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLm1lc3NhZ2VJZF0gTWVzc2FnZS1JRCBmb3IgdGhpcyBtZXNzYWdlOyBvdGhlcndpc2UsIHdpbGwgYmUgc2V0IHRvIGEgcmFuZG9tIHZhbHVlXG4gKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMuc3ViamVjdF0gIFwiU3ViamVjdDpcIiBsaW5lXG4gKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMudGV4dHxodG1sXSBNYWlsIGJvZHkgKGluIHBsYWluIHRleHQgYW5kL29yIEhUTUwpXG4gKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMud2F0Y2hIdG1sXSBNYWlsIGJvZHkgaW4gSFRNTCBzcGVjaWZpYyBmb3IgQXBwbGUgV2F0Y2hcbiAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5pY2FsRXZlbnRdIGlDYWxlbmRhciBldmVudCBhdHRhY2htZW50XG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMuaGVhZGVyc10gRGljdGlvbmFyeSBvZiBjdXN0b20gaGVhZGVycyAtIGUuZy4gYHsgXCJoZWFkZXIgbmFtZVwiOiBcImhlYWRlciB2YWx1ZVwiIH1gLiBUbyBzZXQgYW4gb2JqZWN0IHVuZGVyIGEgaGVhZGVyIG5hbWUsIHVzZSBgSlNPTi5zdHJpbmdpZnlgIC0gZS5nLiBgeyBcImhlYWRlciBuYW1lXCI6IEpTT04uc3RyaW5naWZ5KHsgdHJhY2tpbmc6IHsgbGV2ZWw6ICdmdWxsJyB9IH0pIH1gLlxuICogQHBhcmFtIHtPYmplY3RbXX0gW29wdGlvbnMuYXR0YWNobWVudHNdIEFycmF5IG9mIGF0dGFjaG1lbnQgb2JqZWN0cywgYXNcbiAqIGRlc2NyaWJlZCBpbiB0aGUgW25vZGVtYWlsZXIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9ub2RlbWFpbGVyLmNvbS9tZXNzYWdlL2F0dGFjaG1lbnRzLykuXG4gKiBAcGFyYW0ge01haWxDb21wb3Nlcn0gW29wdGlvbnMubWFpbENvbXBvc2VyXSBBIFtNYWlsQ29tcG9zZXJdKGh0dHBzOi8vbm9kZW1haWxlci5jb20vZXh0cmFzL21haWxjb21wb3Nlci8jZS1tYWlsLW1lc3NhZ2UtZmllbGRzKVxuICogb2JqZWN0IHJlcHJlc2VudGluZyB0aGUgbWVzc2FnZSB0byBiZSBzZW50LiAgT3ZlcnJpZGVzIGFsbCBvdGhlciBvcHRpb25zLlxuICogWW91IGNhbiBjcmVhdGUgYSBgTWFpbENvbXBvc2VyYCBvYmplY3QgdmlhXG4gKiBgbmV3IEVtYWlsSW50ZXJuYWxzLk5wbU1vZHVsZXMubWFpbGNvbXBvc2VyLm1vZHVsZWAuXG4gKi9cbkVtYWlsLnNlbmRBc3luYyA9IGFzeW5jIGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgY29uc3QgZW1haWwgPSBvcHRpb25zLm1haWxDb21wb3NlciA/IG9wdGlvbnMubWFpbENvbXBvc2VyLm1haWwgOiBvcHRpb25zO1xuXG4gIGxldCBzZW5kID0gdHJ1ZTtcbiAgc2VuZEhvb2tzLmZvckVhY2goKGhvb2spID0+IHtcbiAgICBzZW5kID0gaG9vayhlbWFpbCk7XG4gICAgcmV0dXJuIHNlbmQ7XG4gIH0pO1xuICBpZiAoIXNlbmQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoRW1haWwuY3VzdG9tVHJhbnNwb3J0KSB7XG4gICAgY29uc3QgcGFja2FnZVNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy5lbWFpbCB8fCB7fTtcbiAgICByZXR1cm4gRW1haWwuY3VzdG9tVHJhbnNwb3J0KHsgcGFja2FnZVNldHRpbmdzLCAuLi5lbWFpbCB9KTtcbiAgfVxuXG4gIGNvbnN0IG1haWxVcmxFbnYgPSBwcm9jZXNzLmVudi5NQUlMX1VSTDtcbiAgY29uc3QgbWFpbFVybFNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzPy5lbWFpbDtcblxuICBpZiAoTWV0ZW9yLmlzUHJvZHVjdGlvbiAmJiAhbWFpbFVybEVudiAmJiAhbWFpbFVybFNldHRpbmdzKSB7XG4gICAgLy8gVGhpcyBjaGVjayBpcyBtb3N0bHkgbmVjZXNzYXJ5IHdoZW4gdXNpbmcgdGhlIGZsYWcgLS1wcm9kdWN0aW9uIHdoZW4gcnVubmluZyBsb2NhbGx5LlxuICAgIC8vIEFuZCBpdCB3b3JrcyBhcyBhIHJlbWluZGVyIHRvIHByb3Blcmx5IHNldCB0aGUgbWFpbCBVUkwgd2hlbiBydW5uaW5nIGxvY2FsbHkuXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ1lvdSBoYXZlIG5vdCBwcm92aWRlZCBhIG1haWwgVVJMLiBZb3UgY2FuIHByb3ZpZGUgaXQgYnkgdXNpbmcgdGhlIGVudmlyb25tZW50IHZhcmlhYmxlIE1BSUxfVVJMIG9yIHlvdXIgc2V0dGluZ3MuIFlvdSBjYW4gcmVhZCBtb3JlIGFib3V0IGl0IGhlcmU6IGh0dHBzOi8vZG9jcy5tZXRlb3IuY29tL2FwaS9lbWFpbC5odG1sLidcbiAgICApO1xuICB9XG5cbiAgaWYgKG1haWxVcmxFbnYgfHwgbWFpbFVybFNldHRpbmdzKSB7XG4gICAgY29uc3QgdHJhbnNwb3J0ID0gZ2V0VHJhbnNwb3J0KCk7XG4gICAgc210cFNlbmQodHJhbnNwb3J0LCBlbWFpbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiBkZXZNb2RlU2VuZEFzeW5jKGVtYWlsLCBvcHRpb25zKTtcbn07XG4iXX0=
