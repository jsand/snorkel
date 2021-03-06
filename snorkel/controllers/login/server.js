"use strict";
var page = require_root("server/page");
var config = require_root("server/config");
var template = require_root("server/template");
var context = require_root("server/context");
var controller = require_root("server/controller");

module.exports = {
  routes: {
    "" : "index"
  },

  index: function() {
    if (controller.require_https()) { return; }

    if (context("req").user) {
      context("res").redirect("/query");
    } else {
      var header_str = template.render("helpers/header.html.erb", { show_user_status: false });

      var use_google_auth = !!(config.google_auth && config.google_auth.enabled);
      var template_str = template.render("controllers/login.html.erb", { google: use_google_auth });

      template.add_stylesheet("login");
      page.render({ content: template_str, header: header_str});
    }
  },

  realtime: function() {},
  socket: function() {}
};
