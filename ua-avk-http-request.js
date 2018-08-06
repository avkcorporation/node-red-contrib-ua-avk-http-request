"use strict";

var request = require('request');
var mustache = require("mustache");
var fs = require('fs');
var Duplex = require('stream').Duplex;

module.exports = function (RED) {

  function HTTPRequest(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    var nodeUrl = n.url;
    var nodeFollowRedirects = n["follow-redirects"];
    var isTemplatedUrl = (nodeUrl || "").indexOf("{{") != -1;
    var nodeMethod = n.method || "GET";
    var filepath;

    if (n.tls) {
      var tlsNode = RED.nodes.getNode(n.tls);
    }
    this.ret = n.ret || "txt";
    if (RED.settings.httpRequestTimeout) {
      this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000;
    } else {
      this.reqTimeout = 120000;
    }

    this.on("input", function (msg) {
      var preRequestTimestamp = process.hrtime();
      node.status({
        fill: "blue",
        shape: "dot",
        text: "httpin.status.requesting"
      });

      var url = nodeUrl || msg.url;
      if (msg.url && nodeUrl && (nodeUrl !== msg.url)) { // revert change below when warning is finally removed
        node.warn(RED._("common.errors.nooverride"));
      }
      if (isTemplatedUrl) {
        url = mustache.render(nodeUrl, msg);
      }
      if (!url) {
        node.error(RED._("httpin.errors.no-url"), msg);
        node.status({
          fill: "red",
          shape: "ring",
          text: (RED._("httpin.errors.no-url"))
        });
        return;
      }
      // url must start http:// or https:// so assume http:// if not set
      if (!((url.indexOf("http://") === 0) || (url.indexOf("https://") === 0))) {
        if (tlsNode) {
          url = "https://" + url;
        } else {
          url = "http://" + url;
        }
      }

      var method = nodeMethod.toUpperCase() || "GET";
      if (msg.method && n.method && (n.method !== "use")) { // warn if override option not set
        node.warn(RED._("common.errors.nooverride"));
      }
      if (msg.method && n.method && (n.method === "use")) {
        method = msg.method.toUpperCase(); // use the msg parameter
      }
      var opts = {
        method: method,
        url: url,
        timeout: node.reqTimeout,
        followRedirect: nodeFollowRedirects,
        headers: {},
        encoding: null,
      };

      if (msg.headers) {
        for (var v in msg.headers) {
          if (msg.headers.hasOwnProperty(v)) {
            var name = v.toLowerCase();
            if (name !== "content-type" && name !== "content-length") {
              // only normalise the known headers used later in this
              // function. Otherwise leave them alone.
              name = v;
            }
            opts.headers[name] = msg.headers[v];
          }
        }
      }

      if (msg.payload && (method == "POST" || method == "PUT" || method == "PATCH")) {
        if (opts.headers['content-type'] == 'application/x-www-form-urlencoded') {
          opts.form = msg.payload;
        } else if (opts.headers['content-type'] == 'multipart/form-data') {
            node.log(RED._("\n\n\n\nPAYLOAD-2: ") + JSON.stringify(msg.payload) + "\n\n\n\n");

            //opts.data = msg.payload;



            var payload = msg.payload;
            filepath = msg.filename;
            var url1 = 'https://'+msg.cred.username+':'+msg.cred.password+'@'+msg.cred.path;
            var thisReq = request.post(url1, function(err, resp, body) {

                if (err || !resp) {
                    // node.error(RED._("httpSendMultipart.errors.no-url"), msg);
                    var statusText = "Unexpected error";
                    if (err) {
                        statusText = err;
                    } else if (!resp) {
                        statusText = "No response object";
                    }
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: statusText
                    });
                }
                msg.payload = body;
                msg.statusCode = resp.statusCode || resp.status;
                msg.headers = resp.headers;

                if (node.ret !== "bin") {
                    msg.payload = body.toString('utf8'); // txt

                    if (node.ret === "obj") {
                        try {
                            msg.payload = JSON.parse(body);
                        } catch (e) {
                            node.warn(RED._("httpSendMultipart.errors.json-error"));
                        }
                    }
                }

                node.send(msg);
            });

            node.log(RED._("\n\n\n\n"));
            node.log(RED._("FILEPATH: "+filepath));
            node.log(RED._("\nSTREAM:\n"+JSON.stringify(payload) + "\n"));
            node.log(RED._("\n\n\n\n"));

            var form = thisReq.form();
            form.append('method', payload.method);
            form.append('type', payload.type);
            form.append('sessionid', payload.sessionid);


            //for send file-buffer
            form.append('file', payload.file, {
                filename: filepath,
                encoding: 'binary',
                mimetype: 'image/jpeg',
                size: payload.file.length
            });


        } else {
        }
      }

      if (node.ret === "obj") {
        opts.headers.accept = "application/json, text/plain;q=0.9, */*;q=0.8";
      }

      if (this.credentials && this.credentials.user) {
        opts.auth = {
          user: this.credentials.user,
          pass: this.credentials.password,
          sendImmediately: false
        };
      }

      if (tlsNode) {
        tlsNode.addTLSOptions(opts);
      }



    });

  }

  RED.nodes.registerType("ua-avk-http-request", HTTPRequest, {
    credentials: {
      user: {
        type: "text"
      },
      password: {
        type: "password"
      }
    }
  });
};
