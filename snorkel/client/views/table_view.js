"use strict";

var filter_helper = require("controllers/query/filters");
var helpers = require("client/views/helpers");
var presenter = require("client/views/presenter");
var BaseView = require("client/views/base_view");
var ResultsStore = require("client/js/results_store");

var row_key = helpers.row_key;
function get_wrapper_for_cell(el) {
  var $el = $(el);
  if (!$el.is("td")) {
    $el = $el.parents("td");
  }

  return $el;
}

function get_field_type_for_cell(table, el) {
  var $td = get_wrapper_for_cell(el);
  var $th = $td.closest('table').find('th').eq($td.index());

  var col_name = $th.data('name');
  var col_type = presenter.get_field_type(table, col_name);

  return col_type;
}

function get_field_name_for_cell(table, el) {
  var $td = get_wrapper_for_cell(el);
  var $th = $td.closest('table').find('th').eq($td.index());

  var col_name = $th.data('name');

  return col_name;
}

function get_filter_for_popup(el) {
  // ugh, aunt and uncle datas?
  var wrapper = get_wrapper_for_cell(el).find(".cell_data");


  var op = el.attr("data-op");
  var name = wrapper.attr("data-name");
  var filter_type = wrapper.attr("data-type");
  var value = wrapper.attr("data-value");

  var filter = [filter_type + "." + name, op, value];

  return filter;

}

function get_filter_for_cell(table, el) {
  var field_type = get_field_type_for_cell(table, el);
  var field_name = get_field_name_for_cell(table, el);
  var op = "$regex";

  var value;
  if (el.find(".cell_data").length) {
    value = el.find(".cell_data").attr("data-value");
  } else {
    value = el.html();
  }

  return [field_type + "." + field_name, op, value];
}

var TableView = BaseView.extend({
  events: {
    "click td" : "handle_cell_clicked",
    "click .popover a.option" : "handle_popover_filter_clicked",
    "click .popover a.view" : "handle_popover_view_clicked",
    "click .popover a.overview" : "handle_overview_clicked"
  },

  finalize: function() {
    if (!this.data.results.length) {
      return "No Samples";
    }

    var that = this;
    var group_by = _.clone(this.data.parsed.dims);
    var cols = _.clone(this.data.parsed.cols);

    // TODO: something
    cols.unshift("count"); // modifies cols column

    if (this.data.parsed.weight_col) {
      cols.unshift("weighted_count");
    }

    var col_metadata = jank.controller().get_fields(this.table);

    var headers = [];
    _.each(group_by.concat(cols), function(col) {
      headers.push(col);
    });

    var rows = [];
    var csv_data = [];
    var compare_row_hash = {};
    var compare = this.data.parsed.compare_mode;

    if (compare) {
      this.compare_data.count = 0;
      _.each(this.compare_data.results, function(result) {
        var key = row_key(group_by, result);
        compare_row_hash[key] = result;
        that.compare_data.count += result.weighted_count || result.count;
      });
    }

    this.data.count = 0;
    _.each(this.data.results, function(result) {
      var key = row_key(group_by, result);
      var row = [];
      var csv_row = [];
      _.each(group_by, function(group) {
        row.push(result._id[group]);
        csv_row.push(result._id[group]);
      });

      that.data.count += result.weighted_count || result.count;


      var compare_result = compare_row_hash[key];
      _.each(cols, function(col) {
        var col_value = result[col];
        var cell_div;
        if (compare) {
          var compare_value = (compare_result && compare_result[col]) || 0;
          cell_div = helpers.build_compare_cell(col_value, compare_value);
        } else {
          cell_div = helpers.build_compare_cell(col_value);
        }

        csv_row.push(col_value);

        row.push(cell_div);
      });

      rows.push(row);
      csv_data.push(csv_row);

    });

    this.headers = headers;
    this.rows = rows;


    this.csv_data = headers.join(",") + "\n" + _.map(csv_data, function(row) {
      return row.join(",");
    }).join("\n");

  },

  render: function() {
    var dataset = this.data.parsed.table;
    console.log(this.data);
    var table = helpers.build_table(this.table, this.headers, this.rows, jank.controller().get_fields(dataset));

    var csv_data = "data:text/csv;charset=utf-8," + encodeURIComponent(this.csv_data);

    var csv_link = $("<a/>")
      .attr('href', csv_data)
      .addClass('mbl clearfix')
      .attr('download', dataset + "_" + ResultsStore.to_server(this.data.parsed.id) + "_results.csv")
      .html("Download as CSV");

    this.$el.append(csv_link);

    this.$el
      .append(table)
      .fadeIn();

    return table;
  },

  handle_cell_clicked: function(evt) {
    if (this.options.widget) {
      return;
    }

    if ($(evt.target).parents(".popover").length) {
      return;
    }

    var $td = $(evt.target);
    if (!$td.is("td")) {
      $td = $td.parents("td");
    }

    // http://stackoverflow.com/questions/3523770/how-can-i-get-the-corresponding-table-header-th-from-a-table-cell-td
    var $th = $td.closest('table').find('th').eq($td.index());

    var div = $("<div class='cell_data'>");


    var col_name = $th.attr('data-name');
    var col_type = presenter.get_field_type(this.table, col_name);
    var col_value = $td.find(".value_cell").attr("data-value") || $td.html();

    div.attr("data-value", col_value);
    div.attr("data-name", col_name);
    div.attr("data-type", col_type);

    $td.append(div);

    _.delay(function() {
        jank.once("page:clicked", function() {
          div.popover('destroy');
          div.remove();
        });
      }, 200);

    var that = this;
    $C("table_popover", 
      { type: col_type, name: col_name, row: $td.parents("tr"), cell: $td}, 
      function(cmp) {
        that.popover = cmp;
        div.popover({
          trigger: 'manual',
          placement: 'bottom',
          content: cmp.$el,
          html: true
        }).popover('show');
      });
  },

  handle_popover_filter_clicked: function(evt) {
    var el = $(evt.target);
    if (!el.hasClass("option")) {
      el = el.parents(".option");
    }

    var filter = get_filter_for_popup(el);

    filter_helper.add_or_update([filter], [filter]);
  },

  handle_popover_view_clicked: function(evt) {
    var el = $(evt.target);
    if (!el.hasClass("view")) {
      el = el.parents(".view");
    }

    var table = this.table;

    var row = this.popover.options.row;
    var filters = [];
    _.each(row.find("td"), function(td) {
      var $td = $(td);
      var type = get_field_type_for_cell(table, $td);
      if (type === "string") {
        var filter = get_filter_for_cell(table, $td);
        filters.push(filter);
      }
    });


    if (filters.length) {
      if (jank.controller().compare_mode()) {
        filter_helper.add_or_update(filters, filters);
        jank.controller().show_compare_filters();
      } else {
        filter_helper.add_or_update(filters);
      }
    }

    var to_view = el.attr("data-view");

    var agg;
    var field = get_field_name_for_cell(this.table, this.popover.options.cell);
    var fields = [field];

    if (to_view === "time_count") {
      to_view = "time";
      field = "";
      fields = [];
      agg = "$count";
    }

    if (field) {
      jank.controller().trigger("set_control", "field", field);
      jank.controller().trigger("set_control", "fieldset", fields);
    }

    if (agg) {
      jank.controller().trigger("set_control", "agg", agg);
    }


    jank.controller().trigger("swap_panes", false);
    jank.controller().trigger("switch_views", to_view);

    // update location
  },

  handle_overview_clicked: function(evt) {
    var $td = $(evt.target);
    if (!$td.is("td")) {
      $td = $td.parents("td");
    }
    var that = this;

    var field = get_field_name_for_cell(this.table, $td);
    var plotted_vals = [];
    _.each(this.data.results, function(result) {
      var count = result.weighted_count || result.count;
      var of_total = Math.max(count / that.data.count, 0.05);
      plotted_vals.push({
        x: parseInt(result[field]),
        y: 2,
        marker: {
          radius: 10,
          fillColor:'rgba(24,90,169,' + of_total + ')'
        }
      });
    });

    var compare = (this.compare_data && this.compare_data.results || []);
    _.each(compare, function(result) {
      if (!result[field]) {
        return;
      }

      var count = result.weighted_count || result.count;
      var of_total = Math.max(count / that.data.count, 0.1);
      plotted_vals.push({
        x: parseInt(result[field]),
        y: 1,
        marker: {
          radius: 10,
          fillColor:'rgba(169,24,24,' + of_total + ')'
        }
      });
    });

    var options = {
      chart: {
          type: 'scatter',
          zoomType: 'xy',
      },
      xAxis: {
        type: "linear",
      },
      yAxis: {
        labels: {
          enabled: false
        }
      },
      plotOptions: {
        series: {
          marker: {
            enabled: true,
            states: {
              hover: {
                enabled: false
              }
            }
          }
        }
      },
      series: [{
        data: plotted_vals,
        marker: {
          symbol: 'square',
          lineColor:'rgba(0,0,0,0)',
          lineWidth: 1,
        }
      }],
    };

    $C("highcharter", {skip_client_init: true}, function(cmp) {
      $C("modal", {title: "overview of " + field + " values"}, function(modal) {
        modal.$el.find(".modal-body")
          .append(cmp.$el)
          .css("text-align", "center");

        cmp.$el.height("100px");
        cmp.$el.width("80%");
        cmp.$el.css("display", "inline-block");

        modal.show();

        // There's a little setup cost to highcharts, maybe?
        cmp.client(options);
      });
    });

  }

}, {
  icon: "noun/table.svg"
});

jank.trigger("view:add", "table", {
  include: helpers.STD_INPUTS.concat(["compare", "sort_by"]),
  exclude: _.without(helpers.STD_EXCLUDES, "sort_by"),
  icon: "noun/table.svg"
}, TableView);

module.exports = TableView;
