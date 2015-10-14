'use strict';

/**
 * ONLY CONTAINS FUNCTIONS USED ON CLIENT AND SERVER
 *
 * Contains Core Game Logic
 *    Since simulation is run on both client and server, it makes sense to share some functions
*/

var fakeClient = false; //Will be set to true if we are faking being a client on the server for tests
var onServer = function () {
  if (!fakeClient && 'undefined' != typeof (global)) //Check if we are on the server and are not pretending to be a client
    return true;
  return false;
};

/**
 * Main update loop runs on requestAnimationFrame, which will fallback to a setTimout loop on the server
 */
var setupTiming = function (window) {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];

  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] ||
      window[vendors[x] + 'CancelRequestAnimationFrame'];
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback, element) {
      var currentTime = Date.now();
      var timeToCall = Math.max(0, GameCore.frameTime - (currentTime - lastTime));
      var id = window.setTimeout(function () {
        callback(currentTime + timeToCall);
      }, timeToCall);
      lastTime = currentTime + timeToCall;
      return id;
    };
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }
};

/**
 * @constructor
 * Main game class
 * Created on both client and server
 * @param gameInstance instance of game to run logic on
 * @param clientFake boolean if this is a fake instance of a client (ex for testing)
 */
var GameCore = function (gameInstance, clientFake) {
  /** @constant */
  GameCore.PHYSICS_UPDATE_TIME = 15; //Every 15ms run physics update
  /** @constant */
  GameCore.DELTA_UPDATE_TIME = 4; //Every 4ms run delta update
  /** @constant */
  GameCore.frameTime = 60 / 1000; //Run client game logic at 60hz

  if('undefined' == typeof (mathUtils)) { //If we are on the server, reference functions
    GameCore.mathUtils = require('./utils/mathUtils');
    require('../server/serverCore'); //Supplies gamePlayer as well
  } else { //If we are on the client, simply put functions inside GameCore
    GameCore.mathUtils = mathUtils;
  }

  if (clientFake === true) this.fakeClient = true;
  else this.fakeClient=false;

  if (onServer()) GameCore.frameTime = 45; //Run at 22hz on server
  setupTiming(typeof window == 'undefined' ? global : window); //Create timing mechanism that works both serverside and clientside

  this.instance = gameInstance;
  this.server = this.instance !== undefined; //Store if we are the server
  this.world = {width: 720, height: 480};

  //Create player set and tell them the game is running
  this.players = []; //Players is an array of the id's as keys, or 0 for self if we don't have an ID yet

  if (this.server) { //Add clients reported from GameServer to the simulation
    for (var key in this.instance.players) {
      if (this.instance.players.hasOwnProperty(key)) {
        console.log('adding player ' + key);
        this.createNewPlayer(this.instance.players[key]);
      }
    }
  } else { //On Client
      this.socket = {userID: 0};//Initial ID before server assigns us one
      this.createNewPlayer({userID: this.socket.userID});

      //Display ghosts
      this.ghosts = {
        serverPosSelf: new GamePlayer(this), //Our ghost position on the server
        serverPosOther: [], //The other player's server position
        posOther: [] //The other players lerp position
      };
      //Setup Ghosts
      this.ghosts.serverPosSelf.infoColor = 'rgba(255,255,255,0.2)';
      this.ghosts.serverPosSelf.state = 'serverPos';
      this.ghosts.serverPosSelf.pos = {x: 20, y: 20};
  }

  this.playerSpeed = 109; //Movespeed in pixels (used 66 times per second)
  //Setup Physics Vars
  this._pdt = 0.0001; //Physics delta time
  this._pdte = new Date().getTime(); //Physics last delta time
  //Timer to sync client with server
  this.localTime = 0.016; //Local Timer
  this._dt = new Date().getTime(); //Timer Delta from last frame
  this._dte = new Date().getTime(); //Timer Delta so far from current frame

  //Start physics loop, happens at different frequency than rendering
  this.createPhysicsSimulation();
  this.createTimer(); //Create fast timer to measure time

  //ClientSide Only Init
  if (!this.server) {
    if (!this.fakeClient)
      this.keyboard = new THREEx.KeyboardState(); //Keyboard Handler

    this.clientCreateConfiguration(); //Create Default Settings for client
    this.serverUpdates = []; //List of recent server updates so we can interpolate
    this.clientConnectToServer(); //Connect to the socket.io server
    this.clientCreatePingTimer(); //Start pinging server and determine latency
    if (!this.fakeClient) {
      this.color = localStorage.getItem('color') || GameCore.mathUtils.randomColor(); //Get color from localStorage or use random color
      localStorage.setItem('color', this.color);
    }
    this.players[this.socket.userID].color = this.color; //Set Players color

    //Make debug gui if requested
    if (String(window.location).indexOf('debug') != -1) {
      this.clientCreateDebugGui();
    }
  } else { //If we are running this serverside
    this.serverTime = 0;
    this.lastState = {};
  }
}; //GameCore constructor

//Serverside we set GameCore as the global type
if ('undefined' != typeof global) {
  module.exports = global.GameCore = GameCore; //TODO figure out if i'm even using this
}

/**
 * Main update loop
 * @param t current time
 */
GameCore.prototype.update = function (t) {
  this.dt = this.lastFrameTime ? ((t - this.lastFrameTime) / 1000.0).fixed() : 0.016; //Calculate Delta Time
  this.lastFrameTime = t;
  if (!this.server) { //If we arent the server, update the client, otherwise update the server
    this.clientUpdate();
  } else {
    this.serverUpdate();
  }
  this.updateID = window.requestAnimationFrame(this.update.bind(this), this.viewport); //Schedule next update

  this.updateTime = Math.abs(new Date().getTime() - t); //Time in ms spent on logic update
};
/**
 * Check collision between the world bounds and the item
 * @param item item to check against the world bounds
 */
GameCore.prototype.checkCollision = function (item) {
  if (item.pos.x <= item.posLimits.xMin) { //Left Wall
    item.pos.x = item.posLimits.xMin;
  }
  if (item.pos.x >= item.posLimits.xMax) { //Right Wall
    item.pos.x = item.posLimits.xMax;
  }
  if (item.pos.y <= item.posLimits.yMin) { //Top Wall
    item.pos.y = item.posLimits.yMin;
  }
  if (item.pos.y >= item.posLimits.yMax) { //Bottom Wall
    item.pos.y = item.posLimits.yMax;
  }

  //Fixed point helps determinism
  item.pos.x = item.pos.x.fixed(4);
  item.pos.y = item.pos.y.fixed(4);
};
/**
 * Process inputs received since last update
 * @param player player to process inputs for
 * @returns {*} resulting vector from inputs
 */
GameCore.prototype.processInput = function (player) {
  var xDir = 0;
  var yDir = 0;
  var ic = player.inputs.length; //Input Count
  if (ic) {
    for (var x = 0; x < ic; ++x) {
      if (player.inputs[x].seq <= player.lastInputSeq) continue; //Skip if we have simulated it locally

      var input = player.inputs[x].inputs;
      var c = input.length;
      for (var i = 0; i < c; ++i) {
        var key = input[i];
        switch (key) { //Switch over keys
          case 'l':
            xDir -= 1;
            break;
          case 'r':
            xDir += 1;
            break;
          case 'd':
            yDir += 1;
            break;
          case 'u':
            yDir -= 1;
            break;
        }
      }
    }
  }
  var resultingVector = this.physicsMovementVectorFromDirection(xDir, yDir);
  if (player.inputs.length) {
    //Clear array of proccessed inputs
    player.lastInputTime = player.inputs[ic - 1].time;
    player.lastInputSeq = player.inputs[ic - 1].seq;
  }
  return resultingVector;
};

/**
 * Takes a direction and multiplies into a movement vector using playerSpeed
 * @param x x direction
 * @param y y direction
 * @returns {{x: Number, y: Number}} Vector of movement
 */
GameCore.prototype.physicsMovementVectorFromDirection = function (x, y) {
  //Must be fixed step at physics sync speed
  return {
    x: (x * (this.playerSpeed * 0.015)).fixed(3), //0.015=1/66 (1 / input poll time (physics update time))
    y: (y * (this.playerSpeed * 0.015)).fixed(3)
  };
};
/**
 * Update physics callable from both client and server
 */
GameCore.prototype.updatePhysics = function () {
  var time = new Date().getTime();
  if (this.server) {
    this.serverUpdatePhysics();
  } else {
    this.clientUpdatePhysics();
  }
  this.physicsUpdateTime = Math.abs(time - new Date().getTime()); //Time in ms spent updating physics
};
/**
 * Add new player to local version of the server
 * @param playerInstance instance of player (only userID field is used for clientside)
 */
GameCore.prototype.createNewPlayer = function (playerInstance) {
  if (this.players[playerInstance.userID]) {
    console.warn('Tried to create a player that already existed! ' + playerInstance.userID);
    return;
  }
  if (this.server) {
    this.serverCreateNewPlayer(playerInstance);
  } else {
    this.clientCreateNewPlayer(playerInstance.userID);
  }
  //console.log('Created player ' + playerInstance.userID);
};
/**
 * Remove player from local version of server
 * @param playerInstance instance of player (only userID field is used)
 */
GameCore.prototype.removePlayer = function (playerInstance) {
  if (this.server) {
    this.serverRemovePlayer(playerInstance);
  } else {
    this.clientRemovePlayer(playerInstance.userID);
  }
  //console.log('Removed player ' + playerInstance.userID);
};

/**
 * Create Timer to update deltas
 */
GameCore.prototype.createTimer = function () {
  setInterval(function () {
    this._dt = new Date().getTime() - this._dte; //Time spent last delta frame
    this._dte = new Date().getTime();
    this.localTime += this._dt / 1000.0;
  }.bind(this, GameCore.DELTA_UPDATE_TIME));
};
/**
 * Create Timer to update physics simulation
 */
GameCore.prototype.createPhysicsSimulation = function () {
  setInterval(function () {
    this._pdt = (new Date().getTime() - this._pdte) / 1000.0;
    this._pdte = new Date().getTime();
    this.updatePhysics();
  }.bind(this), GameCore.PHYSICS_UPDATE_TIME);
};
