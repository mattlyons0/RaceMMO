var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var debug = require('debug')('RaceMMO:app');
var error = require('debug')('RaceMMO:app:error');

var routes = require('./routes/index');
var play = require('./routes/play');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); //Serve files from public
app.use('/javascripts/game', express.static(__dirname + '/shared')); //Serve files from shared into public javascript folder
app.use('/javascripts/game', express.static(__dirname + '/client')); //Serve files from client into public javascript folder

app.use('/', routes);
app.use('/play', play);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

//Manage shutdown gracefully
var shutdown=function() {
  debug('Received shutdown request. Server is shutting down...');
  app.sio.close();
  debug('Socket.IO has shutdown.');
  app.server.close(function () {
    debug('Express has shutdown.');
    process.exit();
  });
  setTimeout(function () {
    error('Could not shutdown express in 30 seconds. Forcing shutdown.');
    process.exit();
  }, 30 * 1000);//If cannot shutdown after 30 seconds forcefully shutdown express
};

//Gracefully Shutdown upon receiving these signals
//process.on('SIGTERM', shutdown);
//process.on('SIGINT', shutdown);
//process.on('SIGHUP', shutdown);
//process.on('SIGQUIT', shutdown);

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

//var repl = require("repl");
//r = repl.start("node> ");
//r.context.shutdown = shutdown;

module.exports = app;
