var express = require('express');
var toobusy = require('toobusy-js');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var compression = require('compression');
var minify = require('express-minify');
var debug = require('debug')('RaceMMO:app');
var error = require('debug')('RaceMMO:app:error');

var routes = require('./routes/index');
var play = require('./routes/play');

var app = express();

setupJade();
setupMorgan();
setupTooBusy();
setupCompression();
setupPaths();
setupErrorHandlers();
if(typeof process === 'function') //Don't crash when running mocha
  process.on('SIGINT', shutdown); //Gracefully Shutdown

function setupJade() {
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');
}

function setupMorgan() {
  if (app.get('env') === 'development') {
    app.use(logger('dev')); //Logs Webserver Requests
  } else {
    app.use(logger('common', {
      skip: function (req, res) {
        return res.statusCode < 400
      }
    }));
  }
}
function setupTooBusy() {
  //Block requests when server is overloaded
  app.use(function (req, res, next) {
    if (toobusy()) {
      var err = new Error("TooBusy");
      err.status = 503;
      next(err);

    } else {
      next();
    }
  });
}
function setupCompression() {
  app.use(compression()); //Compress pages using express' built in compression DEFAULTS TO 8/10 RAM USAGE

  if(app.get('env')!=='development') {
    app.use(minify( //Minify css and js
      {
        cache: false //WARNING WILL CACHE IN RAM
      }
    ));
  }
}

function setupErrorHandlers(){
  // catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  // error handlers

  // development error handler
  // will print stacktrace
  if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
      this.renderError(err, res, true);
    });
  }

  // production error handler
  // no stacktraces leaked to user
  app.use(function(err, req, res, next) {
    this.renderError(err, res, false);
  });

  this.renderError=function renderError(err,res, devEnv) {

    res.status(err.status || 500);
    if(err.message==='TooBusy'){
      res.render('tooBusy', {
        error: err
      });
    } else {
      res.render('error', {
        message: err.message,
        error: devEnv ? err : {} //Display stacktrace if development is the environment
      });
    }
  }
}

function setupPaths() {
  // uncomment after placing your favicon in /public
  //app.use(favicon(__dirname + '/public/favicon.ico'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public'))); //Serve files from public
  app.use('/javascripts/game', express.static(__dirname + '/shared')); //Serve files from shared into public javascript folder
  app.use('/javascripts/game', express.static(__dirname + '/client')); //Serve files from client into public javascript folder

  app.use('/', routes);
  app.use('/play', play);
}

//Manage shutdown gracefully
var shutdown=function() {
  debug('Received shutdown request. Server is shutting down...');
  app.sio.close();
  debug('Socket.IO Shutdown.');
  app.server.close();
  debug('Server Shutdown');
  toobusy.shutdown();
  debug('TooBusy Shutdown');

  process.exit();

  setTimeout(function () {
    error('Could not shutdown express in 30 seconds. Forcing shutdown.');
    process.exit();
  }, 30 * 1000);//If cannot shutdown after 30 seconds forcefully shutdown
};
//var repl = require("repl");
//r = repl.start("node> ");
//r.context.shutdown = shutdown;

module.exports = app;
