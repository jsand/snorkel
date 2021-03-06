"use strict";

var db = require_root("server/db");

var passport = require('passport');
var session = require_root("server/session");
var context = require_root("server/context");
var config = require_root("server/config");
var readfile = require("./readfile");
var htpasswd = require("htpasswd");

var https = require('https');

var LocalStrategy = require('passport-local').Strategy;
var parseCookie = require("express").cookieParser(session.secret());

var USERS = {};

try {
  var users = readfile(config.authorized_users);
  _.each(users.split("\n"), function(user_line) {
    var user_data = user_line.split(":");
    var passhash = user_data.pop();
    var username = user_data.pop();
    USERS[username] = passhash;
  });

} catch (e) {};

if (!Object.keys(USERS).length) {
  console.log("AUTH: default login is 'test' / 'me'");
  console.log("AUTH: admin login is 'admin' / 'me'");
  USERS = {
    'test' : '$apr1$XkcK6vCf$RTzLu3dNhr71R.mEmJPBK0',
    'admin' : '$apr1$XkcK6vCf$RTzLu3dNhr71R.mEmJPBK0'
  };
}

var _users = {};
var __id = 0;

function new_user(name) {
  var obj = {id: __id++, username: name};
  _users[obj.id] = obj;
  return obj;

}
module.exports = {

  install: function(app, io) {
    passport.serializeUser(function(user, done) {
      _users[user] = user;
      done(null, user.username);
    });

    passport.deserializeUser(function(id, done) {
      _users[id] = _users[id] || { id: __id++, username: id };
      done(null, _users[id]);
    });

    if (config.google_auth && config.google_auth.enabled) {
      var GoogleStrategy = require('passport-google').Strategy;

      // Redirect the user to Google for authentication.  When complete, Google
      // will redirect the user back to the application at
      //     /auth/google/return
      app.get('/auth/google', passport.authenticate('google'));

      // Google will redirect the user to this URL after authentication.  Finish
      // the process by verifying the assertion.  If valid, the user will be
      // logged in.  Otherwise, authentication has failed.
      app.get('/auth/google/return',
        passport.authenticate('google', { successRedirect: '/login/success',
                                          failureRedirect: '/login' }));

      app.get('/login/success', function(req, res) {
        var next = req.session.redirect_to || '/';
        req.session.redirect_to = null;
        return res.redirect(next +'?user=' + req.user.id);
      });
      var realm = "http://" + config.hostname;
      if (!config.behind_proxy) {
        if (config.http_port && config.http_port !== 80 && !config.behind_proxy) {
          realm += ":" + config.http_port;
        }
      }

      passport.use(new GoogleStrategy({
          returnURL: realm + '/auth/google/return',
          realm: realm
        },
        function(identifier, profile, done) {
          var email = profile.emails[0].value.toLowerCase();
          var tokens = email.split("@");
          var domain = tokens.pop();
          var user = email;


          if (config.google_auth.require_domain) {
            if (domain.downcase() !== config.google_auth.require_domain.toLowerCase()) {
              return done("Your email account domain is not authorized to use this instance.");
            }
          }

          if (config.google_auth.authorized_users) {
            if (!config.google_auth.authorized_users[email]) {
              return done("Your email account is not authorized to use this instance.");

            }
          }


          done(null, new_user(user));
        }
      ));
    }

    passport.use(new LocalStrategy(
      function(username, password, done) {
        // creates a user, with an incrementing ID from RAM
        var passhash = USERS[username] || "lkj";
        if (htpasswd.validate(passhash, password)) {
          done(null, new_user(username));
        } else {
          done("just kidding, not just any credentials will wrok. try again");
        }
    }));

    // TODO: via sockets!
    app.post(
      '/logout',
      function(req, res) {
        req.logout();
        res.end("OK");
      });

    app.post(
      '/login',
      passport.authenticate(
        'local',
        { failureRedirect: '/login' }),
      function(req, res, next) {
        var next = req.session.redirect_to || '/';
        req.session.redirect_to = null;
        return res.redirect(next +'?user=' + req.user.id);
      });

    io.set('authorization', function(handshake_data, cb) {
      var that = this;
      var cookie = handshake_data.headers.cookie;
      parseCookie(handshake_data, null, function() {
        var sid = handshake_data.signedCookies['connect.sid'];
        var store = session.store();


        if (sid) {
          store.get(sid, function(err, session) {
            if (err) {
              return cb(err, false);
            }

            var user = session.passport.user;
            // this hangs off the socket manager, technically
            // this is used by query server to log which user is on which
            // socket. maybe i should just make a look up table over here
            // instead, though.
            that.__user = {
              username: user,
              sid: sid
            };

            cb(null, true);

          });
        }
      });

    });
  },

  ensure: function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    req.session.redirect_to = req.path;
    res.redirect('/login');
  },

  require_user: function(func) {
    var ensure = this.ensure;

    return function() {
      var req = context("req");
      var res = context("res");
      var that = this;

      ensure(req, res, function() {
        func.apply(that, arguments)
      });
    }
  },

  setup_ssl_server: function(app) {
    var https_options;
    if (config.ssl) {
      try {
        var privateKey = readfile(config.ssl.key);
        var certificate = readfile(config.ssl.certificate);

        https_options = {
          key: privateKey,
          cert: certificate
        };
      } catch(e) { }


      if (!privateKey || !certificate) {
        console.log("Warning: couldn't read SSL certs and keys, please run scripts/setup_certificates.sh");
      }

    }

    var https_server;
    if (https_options && https_options.key && https_options.cert) {
      https.globalAgent.maxSockets = config.max_https_sockets;
      https_server = https.createServer(https_options, app);
    }

    return https_server;
  }
};

