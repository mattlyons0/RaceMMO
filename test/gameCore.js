/**
 * Game Mechanics
 * Tests shared/gameCore.js
 */
require('should');
var io = require('socket.io-client');
var debug = require('debug')('RaceMMO:test:gameCore');
var port = 1234;
process.env.PORT = port;
var app=require('../bin/www'); //Start Server on port 1234 just for the tests
var gameCore = require('../shared/gameCore');

var socketURL = 'http://localhost:' + port;
var options = {
  transports: ['websocket'],
  'force new connection': true
};

describe('Game Core', function () {
});