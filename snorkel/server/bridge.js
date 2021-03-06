"use strict";

var context = require("./context");
var template = require("./template");

context.setDefault("BRIDGE_CALLS", []);

var __id = 0;
var _ = require_vendor("underscore");
module.exports = {
  // @params:
  //
  // module
  // func
  // args
  call: function() {
    var args = _.toArray(arguments);
    var module = args.shift();
    var func = args.shift();
    
    context("BRIDGE_CALLS").push([module, func, args]);
  },

  raw: function(str) {
    context("res").write("<script>" + str + " </script>");
  },

  controller: function() {
    var args = _.toArray(arguments);

    context("BRIDGE_CALLS").push(["client/js/controller", "call", args]);
  },

  flush_data: function(data, id, cb) {
    var res = context("res");

    if (!res) {
      throw "NO RESPONSE AVAILABLE FOR REQUEST";
      return;
    }

    id = id || ("bridge" + __id++);


    // we strip extensions off CSS_DEPENDENCIES, because the bootloader knows
    // they are .css already
    var css_deps = _.map(context("CSS_DEPS"), 
        function(val, dependency) { return dependency.replace(/\.css$/, ''); });

    var options = {
      js: context("JS_DEPS"),
      css: css_deps,
      tmpl: [],
      cmp: [],
      id: id
    };

    context.reset("JS_DEPS");
    context.reset("CSS_DEPS");

    data = data || "";
    var data_tmpl = template.render("helpers/bridge_payload_content.html.erb", {
      payload: data.replace(/<!--(.*?)-->/, ''),
      payload_id: id
    });

    // build a payload for this data packet and flush it
    var tmpl = template.render("helpers/bridge_payload.html.erb", {
      json_data: JSON.stringify(options)
    });


    res.write(data_tmpl);
    res.write(tmpl);
    res.write(this.render());

    if (cb) {
      cb();
    }
  },

  render: function() {
    // render and replace
    var bridge_calls = context("BRIDGE_CALLS");
    context.reset("BRIDGE_CALLS");

    var ret = "";
    _.each(bridge_calls, function(call) {
      ret += "\n" + template.render("helpers/bridge_call.html.erb", {
        json_data: JSON.stringify({
          module: call[0],
          func: call[1],
          args: call[2]})
      });

    });

    return ret;
  }
};
