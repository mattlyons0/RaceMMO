'use strict';

/**
 * Runs on both client and server
 *
 * Handles Update Loop
 * Handles Animation when running on Client
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
 * Main game class
 * Created on both client and server
 * @param gameInstance instance of game to run logic on
 * @param clientFake boolean if this is a fake instance of a client (ex for testing)
 */
var GameCore = function (gameInstance, clientFake) {
  //CONSTANTS
  GameCore.PHYSICS_UPDATE_TIME = 15; //Every 15ms run physics update
  GameCore.DELTA_UPDATE_TIME = 4; //Every 4ms run delta update

  GameCore.frameTime = 60 / 1000; //Run client game logic at 60hz

  if (clientFake === true) fakeClient = true;

  if (onServer()) GameCore.frameTime = 45; //Run at 22hz on server
  setupTiming(typeof window == 'undefined' ? global : window); //Create timing mechanism that works both serverside and clientside

  this.instance = gameInstance;
  this.server = this.instance !== undefined; //Store if we are the server
  this.world = {width: 720, height: 480};
  //Create player set and tell them the game is running
  this.players = []; //Players is an array of the id's as keys, or 0 for self if we don't have an ID yet
  if (this.server) {
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

  this.playerSpeed = 109; //Movespeed (used 66 times per second)
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
    if (!fakeClient)
      this.keyboard = new THREEx.KeyboardState(); //Keyboard Handler
    this.clientCreateConfiguration(); //Create Default Settings for client
    this.serverUpdates = []; //List of recent server updates so we can interpolate
    this.clientConnectToServer(); //Connect to the socket.io server
    this.clientCreatePingTimer(); //Start pinging server and determine latency
    if (!fakeClient) {
      this.color = localStorage.getItem('color') || this.randomColor(); //Get color from localStorage or use random color
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
  module.exports = global.GameCore = GameCore;
}

/*
 Helper functions for game code
 2D vector code helpers and rounding helpers
 */

/**
 * Rounds number to n places
 * @param n places to round
 * @returns {Number} rounded number to n places
 */
Number.prototype.fixed = function (n) {
  n = n || 3;
  return parseFloat(this.toFixed(n));
};
/**
 * Copies 2d vector to another 2d vector
 * @param a vector to copy
 * @returns {{x: (number|*|Number), y: (number|*|Number)}} copied vector
 */
GameCore.prototype.pos = function (a) {
  return {x: a.x, y: a.y};
};
/**
 * Add 2d vectors
 * @param a vector 1 to add
 * @param b vector 2 to add
 * @returns {{x: (Number|string), y: (Number|string)}} the resulting vector after vector addition
 */
GameCore.prototype.vAdd = function (a, b) {
  return {x: (a.x + b.x).fixed(), y: (a.y + b.y).fixed()};
};
/**
 * Subtract 2d vectors
 * @param a vector 1 to subtract
 * @param b vector 2 to subtract
 * @returns {{x: Number, y: Number}} the resulting vector after subracting a from b
 */
GameCore.prototype.vSub = function (a, b) {
  return {x: (a.x - b.x).fixed(), y: (a.y - b.y).fixed()};
};
/**
 * Multiply a vector by a scalar
 * @param a vector
 * @param b scalar
 * @returns {{x: Number, y: Number}} the result of the scalar multiplication
 */
GameCore.prototype.vMultScalar = function (a, b) {
  return {x: (a.x * b).fixed(), y: (a.y * b).fixed()};
};
/**
 * For the server, cancel the setTimeout
 */
GameCore.prototype.stopUpdate = function () {
  window.cancelAnimationFrame(this.updateID);
};
/**
 * Simple linear interpolation
 * @param p
 * @param n
 * @param t
 * @returns {Number|string}
 */
GameCore.prototype.lerp = function (p, n, t) {
  var _t = Number(t);
  _t = (Math.max(0, Math.min(1, _t))).fixed();
  return (p + _t * (n - p)).fixed();
};
/**
 * Simple linear interpolation between 2 vectors
 * @param v
 * @param tv
 * @param t
 * @returns {{x: (Number|string), y: (Number|string)}}
 */
GameCore.prototype.vLerp = function (v, tv, t) {
  return {x: this.lerp(v.x, tv.x, t), y: this.lerp(v.y, tv.y, t)};
};
/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
GameCore.prototype.randomInt = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generates a random color in hex
 * @returns {string} random color
 */
GameCore.prototype.randomColor = function () {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
};

/**
 * Player Class, manage player state and draw if needed
 * @param gameInstance instance of game
 * @param playerInstance instance of player
 */
var GamePlayer = function (gameInstance, playerInstance) {
  //Store Instance
  this.instance = playerInstance;
  this.game = gameInstance;

  //Setup State
  this.pos = {x: 0, y: 0};
  this.size = {x: 16, y: 16, hx: 8, hy: 8}; //x,y,heightX,heightY
  this.state = 'not-connected';
  this.id = ''; //Will be assigned later
  this.online = false;
  if (playerInstance)
    this.online = true;

  //Movement
  this.oldState = {pos: {x: 0, y: 0}};
  this.currentState = {pos: {x: 0, y: 0}};
  this.stateTime = new Date().getTime();

  this.inputs = []; //History of inputs

  //World bounds
  this.posLimits = {
    xMin: this.size.hx,
    xMax: this.game.world.width - this.size.hx,
    yMin: this.size.hy,
    yMax: this.game.world.height - this.size.hy
  };
  this.pos = {x: 0, y: 0}; //Need to update this later
};

/**
 *
 */
GamePlayer.prototype.draw = function () {
  if (fakeClient) return;
  //Draw Player Rectangle
  game.ctx.fillStyle = 'rgba(255,255,255,0.1)'; //Draw grey if online is false
  if (this.online === true)
    game.ctx.fillStyle = this.color;
  if (this.id === this.game.socket.userID)
    game.ctx.fillStyle = this.game.color;
  game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);
  //Draw Player Status
  if (this.online === true)
    game.ctx.fillStyle = this.infoColor;
  game.ctx.fillText(this.state, this.pos.x + 10, this.pos.y + 4);
};

/*
 COMMON FUNCTIONS
 Generic Functions for game state
 */

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

/*
 SERVER FUNCTIONS
 Functions specifically for serverSide only
 */
/**
 * Create player instance for server logic
 * @param player instance of player
 */
GameCore.prototype.serverCreateNewPlayer = function (player) {
  this.players[player.userID] = new GamePlayer(this, player);
  var playerObj = this.players[player.userID];
  playerObj.pos =
  { //Generate random starting positions for each player
    x: this.randomInt(playerObj.posLimits.xMin, playerObj.posLimits.xMax),
    y: this.randomInt(playerObj.posLimits.yMin, playerObj.posLimits.yMax)
  };
};
/**
 * Remove player instance from server logic
 * @param player instance of player
 */
GameCore.prototype.serverRemovePlayer = function (player) {
  delete this.players[player.userID];
};
/**
 * Updated every 15ms, simulates world state
 */
GameCore.prototype.serverUpdatePhysics = function () {
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      player.oldState.pos = this.pos(player.pos); //Move current state to oldState
      var newDir = this.processInput(player);
      player.pos = this.vAdd(player.oldState.pos, newDir);
      player.inputs = []; //Remove input queue because they were processed
    }
  }
  //Seperate loops because we want collision check to happen after movement
  //Do Collision
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];
      this.checkCollision(player1);
    }
  }
};
/**
 * Notify clients of changes to player states
 */
GameCore.prototype.serverUpdate = function () {
  this.serverTime = this.localTime; //Update our clock to match timer
  //if(this.lastState.his===this.players.self.lastInputSeq&&this.lastState.cis===this.players.other.lastInputSeq) {
  //  return; //Disables sending same state multiple times, but also causes state match bugs, so I'll comment it until its needed
  //}
  var playersData = [];
  var num = 0;
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      playersData[num] = {id: key, pos: player.pos, is: player.lastInputSeq};
      num++;
    }
  }
  this.lastState = { //Snapshot current state for updating clients
    pl: playersData,
    t: this.serverTime //Time local to server
  };

  //Send data updates to all clients
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];
      player1.instance.emit('onserverupdate', this.lastState);
    }
  }
};
/**
 * Ensure input gets put in the array properly
 * @param client client making the inputs
 * @param input input given
 * @param inputTime time input was given
 * @param inputSeq sequence of inputs
 */
GameCore.prototype.handleServerInput = function (client, input, inputTime, inputSeq) {
  var playerClient = this.players[client.userID];//Figure out which player gave the input
  playerClient.inputs.push({inputs: input, time: inputTime, seq: inputSeq}); //Push into array of stored inputs
};

/*
 CLIENTSIDE FUNCTIONS
 Functions for clientside only
 */

/**
 * Handle input clientside
 *  Parse Input and send to server
 *  @param manualInput manually input an array (optionally)
 *  @returns {*} Movement Vector from resulting input
 */
GameCore.prototype.clientHandleInput = function (manualInput) {
  var xDir = 0;
  var yDir = 0;
  var input = [];
  if (manualInput) {
    manualInput.forEach(function (val) {
      input.push(val);
    });
  }

  if (this.keyboard) { //Skip this during tests if it is undefined
    if (this.keyboard.pressed('A') || this.keyboard.pressed('left')) {
      xDir = -1;
      input.push('l');
    }
    if (this.keyboard.pressed('D') || this.keyboard.pressed('right')) {
      xDir = 1;
      input.push('r');
    }
    if (this.keyboard.pressed('S') || this.keyboard.pressed('down')) {
      yDir = 1;
      input.push('d');
    }
    if (this.keyboard.pressed('W') || this.keyboard.pressed('up')) {
      yDir = -1;
      input.push('u');
    }
  }

  if (input.length) {
    this.inputSeq += 1;
    this.players[this.socket.userID].inputs.push({ //Store input state as a snapshot
      inputs: input,
      time: this.localTime.fixed(3),
      seq: this.inputSeq
    });

    //Send server packet
    var serverPacket = 'i.'; //Input packets labeled with 'i'
    serverPacket += input.join('-') + '.';
    serverPacket += this.localTime.toFixed(3).replace('.', '-') + '.';
    serverPacket += this.inputSeq;

    this.socket.send(serverPacket); //Send to server
    return this.physicsMovementVectorFromDirection(xDir, yDir); //Return vector if needed
  } else {
    return {x: 0, y: 0};
  }
};
/**
 * Calculate Client Prediction
 */
GameCore.prototype.clientProcessNetPredictionCorrection = function () {
  //NOTE: this.serverUpdates.pl is the associative array with the key as player id's
  if (!this.serverUpdates.length) return; //Nothing to do if there are no updates

  var latestServerData = this.serverUpdates[this.serverUpdates.length - 1];
  var myData = latestServerData.pl[this.socket.userID];
  var myServerPos = myData.pos; //Get the client position
  this.ghosts.serverPosSelf.pos = this.pos(myServerPos); //Update Ghost with real position

  //Local Input Prediction
  var myLastInputOnServer = myData.is;
  if (myLastInputOnServer) { //We haven't moved from our initial position if undef
    var lastInputSeqIndex = -1; //Last input sequence from my input
    //Find input on server
    for (var i = 0; i < this.players[this.socket.userID].inputs.length; ++i) {
      if (this.players[this.socket.userID].inputs[i].seq == myLastInputOnServer) {
        lastInputSeqIndex = i;
        break;
      }
    }
    if (lastInputSeqIndex != -1) { //Server acknowledges that our inputs were accepted
      var numberToClear = Math.abs(lastInputSeqIndex - (-1)); //Clear inputs we confirmed are on server
      this.players[this.socket.userID].inputs.splice(0, numberToClear);
      this.players[this.socket.userID].currentState.pos = this.pos(myServerPos); //We know we are at this position because the server confirmed it
      this.players[this.socket.userID].lastInputSeq = lastInputSeqIndex;
      //Reapply all inputs that the server hasn't yet confirmed to 'keep' our position the same while confirming the server position
      this.clientUpdatePhysics();
    } else if (this.players[this.socket.userID].inputs.length > (this.netPing / GameCore.PHYSICS_UPDATE_TIME)) { //Warn when inputs haven't been accepted that should have.
      console.warn(this.players[this.socket.userID].inputs.length + ' Inputs have not been accepted by server');
    }
  }
};
/**
 * Process updates from the server
 */
GameCore.prototype.clientProcessNetUpdates = function () {
  if (!this.serverUpdates.length) return; //Nothing to do if there are no updates

  //Find the position in the timeline of the updates we store
  var currentTime = this.clientTime;
  var count = this.serverUpdates.length - 1;
  var target = null;
  var previous = null;

  //Look for oldest update since newest ones are at the end, if our time isn't on timeline it will be very expensive!
  for (var i = 0; i < count; ++i) {
    var point = this.serverUpdates[i];
    var nextPoint = this.serverUpdates[i + 1];

    if (currentTime > point.t && currentTime < nextPoint.t) { //If the server update was between the current time and the last confirmed update
      //We found the most recent server update that we haven't processed yet
      target = nextPoint;
      previous = point;
      break;
    }
  }
  if (!target) { //use last known server pos and move to it
    target = this.serverUpdates[0];
    previous = this.serverUpdates[0];
    if (this.serverUpdates.length > 1)
      console.warn('Could not find last server update!'); //If this happens and it isn't on the first tick, something weird is going on
  }

  //Interpolate between target and previous destination
  if (target && previous) {
    //Timing Math
    this.targetTime = target.t;

    var difference = this.targetTime - currentTime;
    var maxDifference = (target.t - previous.t).fixed(3);
    var timePoint = (difference / maxDifference).fixed(3);

    //Safeguard extreme cases (divide by 0)
    if (isNaN(timePoint))timePoint = 0;
    if (timePoint == -Infinity)timePoint = 0;
    if (timePoint == Infinity)timePoint = 0;

    //Movement Math
    var latestServerData = this.serverUpdates[this.serverUpdates.length - 1]; //Most Recent Server Update
    for (var id in this.players) {
      if (this.players.hasOwnProperty(id) && id !== this.socket.userID) { //Process everyone other than current client
        if (!latestServerData.pl[id]) { //We don't exist in the server update, maybe because we recently disconnected and reconnected
          console.warn('Player not in server update!');
          continue;
        }
        var otherServerPos = latestServerData.pl[id].pos; //The exact server positions, used for the ghost
        var otherTargetPos = target.pl[id] ? target.pl[id].pos : undefined; //If player exists in these server states, use their position. If not undefined will be correctly handled below
        var otherPastPos = previous.pl[id] ? previous.pl[id].pos : undefined;

        //Update Destination Ghost
        this.ghosts.serverPosOther[id].pos = this.pos(otherServerPos);

        //ghosts.posOther is the destination position, if there is no past position theres no destination
        if (otherPastPos && otherTargetPos) { //If we can update the ghost using lerp great, if not fall back to simply plugging in from server update
          this.ghosts.posOther[id].pos = this.vLerp(otherPastPos, otherTargetPos, timePoint); //Linear interpolation between past and target position at a given time
        } else { //Player didn't exist in last server update, so simply plug in his position
          this.ghosts.posOther[id].pos = this.pos(otherServerPos);
        }
        if (this.clientSmoothing && otherPastPos && otherTargetPos) { //Meets the conditions to do lerp, if not we assume we will have more data next server update or smoothing is off
          this.players[id].pos = this.vLerp(this.players[id].pos, this.ghosts.posOther[id].pos, this._pdt * this.clientSmooth); //lerp serverPos with directionVector with timeDelta*smoothAmt
        } else { //No Smoothing
          this.players[id].pos = this.pos(this.ghosts.posOther[id].pos); //Player Position is the position on the server
        }
      }
    }
    //Called if we aren't predicting client movement, update position of current client from server
    if (!this.clientPredict && !this.naiveApproach) {
      var myServerPos = latestServerData.pl[this.socket.userID].pos;
      var myTarget = target.pl[this.socket.userID];
      //Why would we not exist in the future?
      var myPast = previous.pl[this.socket.userID];
      var myTargetPos, myPastPos;
      if (myTarget && myPast) {
        myTargetPos = myTarget.pos;
        myPastPos = myPast.pos;
      } else { //We didn't exist in the past or in the future (because of a disconnect/reconnect)
        myTargetPos = myServerPos;
        myPastPos = myServerPos;
      }

      this.ghosts.serverPosSelf.pos = this.pos(myServerPos); //Snap ghost to new server pos
      var localTarget = this.vLerp(myPastPos, myTargetPos, timePoint);

      if (this.clientSmoothing) {
        this.players[this.socket.userID].pos = this.vLerp(this.players[this.socket.userID].pos, localTarget, this._pdt * this.clientSmooth);
      } else {
        this.players[this.socket.userID].pos = this.pos(localTarget);
      }
    }
  }
};
/**
 * Process updates from the server
 * @param data update packet received from the server
 */
GameCore.prototype.clientOnServerUpdateReceived = function (data) {
  this.serverTime = data.t; //Server time (can be used to calc latency)
  this.clientTime = this.serverTime - (this.netOffset / 1000); //Latency Offset

  var pl = []; //Process data (can't send associative array over socketIO, so I number it then restore it here
  for (var x = 0; x < data.pl.length; x++) {
    pl[data.pl[x].id] = {pos: data.pl[x].pos, is: data.pl[x].is};
    if (!this.players[data.pl[x].id]) { //New player since last update
      console.warn('Extra player on server! ' + data.pl[x].id);
    }
  }
  if (this.serverUpdates.length === 0) { //Upon first tick, update position from server
    this.players[this.socket.userID].currentState.pos = this.pos(pl[this.socket.userID].pos);
  }
  if (this.naiveApproach) {
    for (var key in this.players) {
      if (this.players.hasOwnProperty(key)) {
        this.players[key].pos = this.pos(pl[key].pos);
      }
    }
  } else { //Lerp Approach
    //Cache data from server, play it back with the netOffset and interpolate between points
    this.serverUpdates.push({pl: pl, t: data.t}); //Add the formatted packet to the array

    //Limit buffer in seconds of updates 60fps*bufferSeconds=samples
    if (this.serverUpdates.length >= (60 * this.bufferSize)) {
      this.serverUpdates.splice(0, 1);
    }
    this.oldestTick = this.serverUpdates[0].t; //If the client gets behind this due to latency, we snap them to the latest tick (only if connection is really bad)
    this.clientProcessNetPredictionCorrection();
  }
};
/**
 * Update client position and states
 */
GameCore.prototype.clientUpdateLocalPosition = function () {
  if (this.clientPredict) {
    var t = (this.localTime - this.players[this.socket.userID].stateTime) / this._pdt; //Time since updated state
    var oldState = this.players[this.socket.userID].oldState.pos;
    var currentState = this.players[this.socket.userID].currentState.pos;

    this.players[this.socket.userID].pos = currentState; //Ensure visual position matches state
    this.checkCollision(this.players[this.socket.userID]); //Keep in world
  }
};
/**
 * Calculate Physics clientside
 */
GameCore.prototype.clientUpdatePhysics = function () {
  this.clientHandleInput();
  this.clientUpdateLocalPosition();

  if (this.clientPredict) {
    //Fetch the direction from input buffer and use it to smooth visuals
    var self = this.players[this.socket.userID];
    self.oldState.pos = this.pos(self.currentState.pos);
    var nd = this.processInput(self); //new direction vector
    self.currentState.pos = this.vAdd(self.oldState.pos, nd);
    self.stateTime = this.localTime;
  }
};
/**
 * Client Update Loop
 *  Draw, Input, Physics
 */
GameCore.prototype.clientUpdate = function () {
  if (!fakeClient) {
    this.ctx.clearRect(0, 0, 720, 480);
    this.clientDrawInfo();
    this.clientDrawServer();
  }
  if (!this.naiveApproach) {
    this.clientProcessNetUpdates();
  }
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key) && key !== this.socket.userID) { //Draw all other players
      this.players[key].draw();
    }
  }
  this.clientUpdateLocalPosition();
  this.players[this.socket.userID].draw(); //Draw after others to be smoother I think.

  if (this.showDestPos && !this.naiveApproach) {
    for (var key1 in this.ghosts.posOther) {
      if (this.ghosts.posOther.hasOwnProperty(key1)) {
        this.ghosts.posOther[key1].draw(); //Draw Other Ghost
      }
    }

  }
  if (this.showServerPos && !this.naiveApproach) {
    this.ghosts.serverPosSelf.draw(); //Draw our ghost
    for (var key2 in this.ghosts.serverPosOther) {
      if (this.ghosts.serverPosOther.hasOwnProperty(key2)) {
        this.ghosts.serverPosOther[key2].draw();
      }
    }
  }
  this.clientRefreshFPS(); //Calculate FPS Average
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
/**
 * Make a ping between the client and server every second to ensure they are connected
 */
GameCore.prototype.clientCreatePingTimer = function () {
  setInterval(function () {
    this.lastPingTime = new Date().getTime();
    this.socket.send('p.' + (this.lastPingTime)); //'p' for ping
  }.bind(this), 1000);
};
/**
 * Setup Client Configuration
 * Initialize Client Vars
 */
GameCore.prototype.clientCreateConfiguration = function () {
  this.showHelp = false; //Help Text
  this.naiveApproach = false; //Naive Approach being poor netcode
  this.showServerPos = false;
  this.showDestPos = false; //Show Interpolation Goal
  this.clientPredict = true; //Use clientside prediction
  this.inputSeq = 0; //Initial input sequence number
  this.clientSmoothing = true; //Clientside prediction uses smoothing
  this.clientSmooth = 25; //Amount of smoothing to apply to client update dest

  this.netLatency = 0.001; //Time from just server>client or client>server (ping/2)
  this.netPing = 0.001; //Round trip time from server and back
  this.lastPingTime = 0.001; //Last time we sent a ping

  this.netOffset = 100; //100ms latency between server and client interpolation for other clients
  this.bufferSize = 2; //The size of the server history to keep for interpolation
  this.targetTime = 0.01; //Time we want to be in the server timeline
  this.oldestTick = 0.01; //Last time tick we have in the buffer

  this.clientTime = 0.01; //Client's clock
  this.serverTime = 0.01; //Time reported from server

  this.dt = 0.016; //Time the last frame took
  this.fps = 0; //1/this.dt
  this.fpsAvgCount = 0; //Samples we have of fps
  this.fpsAvg = 0; //Current avg fps
  this.fpsAvgAcc = 0; //Accumulation of last averagecount

  this.lit = 0;
  this.llt = new Date().getTime();
};
/**
 * Create Debug dat.GUI
 */
GameCore.prototype.clientCreateDebugGui = function () {
  this.gui = new dat.GUI();

  var _playerSettings = this.gui.addFolder('Your Settings');
  this.colorControl = _playerSettings.addColor(this, 'color');
  this.colorControl.onChange(function (value) {
    this.players[this.socket.userID].color = value;
    localStorage.setItem('color', value);
    this.socket.send('c.' + value); //'c' for color
  }.bind(this));
  _playerSettings.open();

  var _otherSettings = this.gui.addFolder('Methods');
  _otherSettings.add(this, 'naiveApproach').listen();
  _otherSettings.add(this, 'clientSmoothing').listen();
  _otherSettings.add(this, 'clientSmooth').min(1).listen();
  _otherSettings.add(this, 'clientPredict').listen();

  var _debugSettings = this.gui.addFolder('Debug View');
  _debugSettings.add(this, 'showHelp').listen();
  _debugSettings.add(this, 'fpsAvg').listen();
  _debugSettings.add(this, 'showServerPos').listen();
  _debugSettings.add(this, 'showDestPos').listen();
  _debugSettings.add(this, 'localTime').listen();
  _debugSettings.open();

  var _conSettings = this.gui.addFolder('connection');
  _conSettings.add(this, 'netLatency').step(0.001).listen();
  _conSettings.add(this, 'netPing').step(0.001).listen();

  _conSettings.open();

  var _netSettings = this.gui.addFolder('Networking');
  _netSettings.add(this, 'netOffset').min(0.01).step(1).listen();
  _netSettings.add(this, 'serverTime').step(0.01).listen();
  _netSettings.add(this, 'clientTime').step(0.01).listen();
  _netSettings.open();
};
/**
 * Handle Current Client Joining a Game
 * @param data  Parsed Data from Server
 */
GameCore.prototype.clientOnJoinGame = function (gameID, gameTime) {
  var self = this.players[this.socket.userID];
  self.infoColor = '#00bb00';
  self.color = this.color;

  this.instance = {id: gameID};

  var serverTime = parseFloat(gameTime.replace('-', '.'));
  this.localTime = serverTime + this.netLatency;
  this.socket.send('c.' + self.color);
};
/**
 * Server gave us a game
 * @param data  Parsed Data from Server
 */
GameCore.prototype.clientOnConnected = function (data) {
  var self = this.players[this.socket.userID];
  self.id = data.id;
  self.infoColor = '#cc0000';
  self.state = 'YOU';
  self.online = true;

  //Migrate Current Client from default ID 0 to its given ID
  console.log('Server Assigned us ID: ' + data.id);
  this.players[data.id] = this.players[this.socket.userID];
  delete this.players[this.socket.userID]; //Complete the move
  this.socket.userID = data.id;
};
/**
 * Create player on client
 * @param id id of player
 */
GameCore.prototype.clientCreateNewPlayer = function (id) {
  this.players[id] = new GamePlayer(this);
  if (id !== 0) { //They were assigned an id, meaning they are online
    this.players[id].online = true;
    this.players[id].state = 'connected';
  }

  if (this.socket.userID !== id) { //If we aren't the client player create ghosts
    this.ghosts.posOther[id] = new GamePlayer(this);
    this.ghosts.posOther[id].infoColor = 'rgba(255,255,255,0.1)';
    this.ghosts.serverPosOther[id] = new GamePlayer(this);
    this.ghosts.serverPosOther[id].infoColor = 'rgba(255,255,255,0.2)';
    this.ghosts.posOther[id].state = 'destPos';
    this.ghosts.serverPosOther[id].state = 'serverPos';
    this.ghosts.posOther[id].pos = {x: 0, y: 0};
    this.ghosts.serverPosOther[id].pos = {x: 0, y: 0};
  }

};
GameCore.prototype.clientRemovePlayer = function (id) {
  delete this.players[id];

  if (this.socket.userID !== id) { //if we aren't the client player, remove the ghosts
    delete this.ghosts.posOther[id];
    delete this.ghosts.serverPosOther[id];
  }
};
/**
 * Called when the other client changes its color
 * @param color  Parsed Data from Server
 */
GameCore.prototype.clientOnOtherClientColorChange = function (id, color) {
  this.players[id].color = color;
};
/**
 * Add player who has connected to the server
 * @param otherID id of player who has connected
 */
GameCore.prototype.clientOnOtherClientJoinGame = function (otherID, color) {
  this.createNewPlayer({userID: otherID});
  this.players[otherID].color = color;
};
/**
 * Remove player who has disconnected from the server
 * @param otherID id of player that disconnected
 */
GameCore.prototype.clientOnOtherClientDisconnect = function (otherID) {
  this.removePlayer({userID: otherID});
};
/**
 * Upon being pinged by server
 * @param data  Parsed Data from Server
 */
GameCore.prototype.clientOnPing = function (data) {
  this.netPing = new Date().getTime() - parseFloat(data);
  this.netLatency = this.netPing / 2;
  this.netOffset = Math.max(1, this.netPing); //Calculate command offset on server based on ping to server
};
/**
 * Called when any message from a server is received
 * @param data server packet received
 */
GameCore.prototype.clientOnNetMessage = function (data) {
  var command = data.split('.'); //'.' delimits commands
  switch (command[0]) {
    case 's': //Server Message
      switch (command[1]) {
        case 'y': //You (a message about our current player)
          switch (command[2]) {
            case 'j': //We are joining a lobby
              this.clientOnJoinGame(command[3], command[4]); //GameID, ServerTime
              break;
          }
          break;
        case 'pl': //Players (a message about another player in our game)
          switch (command[2]) {
            case 'j': //A player is joining
              this.clientOnOtherClientJoinGame(command[3], command[4]); //userID, color
              break;
            case 'c': //Other player color changed
              this.clientOnOtherClientColorChange(command[4], command[3]); //client id that changed, color
              break;
            case 'd': //Other player disconnected
              this.clientOnOtherClientDisconnect(command[3]);
          }
          break;
        case 'e': //Game has ended
          this.clientOnDisconnect(command[2]);
          break;
        case 'p': //Server Ping
          this.clientOnPing(command[2]);
          break;
      }
      break; //If its anything but a server message we ignore it
  }
};
/**
 * Called once the client is requested to disconnect because the game is over
 * @param data data from disconnect command
 */
GameCore.prototype.clientOnDisconnect = function (data) {
  //We don't know if the other player is still connected, we arent so everything goes offline
  var self = this.players[this.socket.userID];
  self.infoColor = 'rgba(255,255,255,0.1)';
  self.state = 'not-connected';
  self.online = false;

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key) && key !== this.socket.userID) {
      this.removePlayer({userID: key});
      this.serverUpdates = [];
    }
  }
};
/**
 * Handle Connecting to the server
 */
GameCore.prototype.clientConnectToServer = function () {
  if (fakeClient)
    this.socket = require('../test/testUtils').connect();
  else
    this.socket = io.connect();

  this.socket.userID = 0;
  this.socket.on('connect', function () {
    this.players[this.socket.userID].state = 'connecting'; //We are not 'connected' until we have a server ID and we are placed in a server
  }.bind(this));

  this.socket.on('disconnect', this.clientOnDisconnect.bind(this)); //Sent when we are disconnected (network, serverDown...)
  this.socket.on('onserverupdate', this.clientOnServerUpdateReceived.bind(this)); //Sent each tick of server simulation (authoritative update)
  this.socket.on('onconnected', this.clientOnConnected.bind(this)); //Handle when we connect to server
  this.socket.on('error', this.clientOnDisconnect.bind(this)); //On an error show that we aren't connected
  this.socket.on('message', this.clientOnNetMessage.bind(this)); //On message parse the commands and send to handlers
};
/**
 * Calculate FPS
 */
GameCore.prototype.clientRefreshFPS = function () {
  //Store the fps for 10 frames
  this.fps = 1 / this.dt;
  this.fpsAvgAcc += this.fps;
  this.fpsAvgCount++;

  if (this.fpsAvgCount >= 10) {
    this.fpsAvg = this.fpsAvgAcc / 10;
    this.fpsAvgCount = 1;
    this.fpsAvgAcc = this.fps;
  }
};

GameCore.prototype.clientDrawInfo = function () {
  this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
  if (this.showHelp) {
    this.ctx.fillText('netOffset : local offset between players and their server updates.', 10, 30);
    this.ctx.fillText('serverTime : last known game time on server', 10, 70);
    this.ctx.fillText('clientTime : delayed game time on client for other players only (includes the net_offset)', 10, 90);
    this.ctx.fillText('netLatency : Time from you to the server. ', 10, 130);
    this.ctx.fillText('netPing : Time from you to the server and back. ', 10, 150);
    this.ctx.fillText('clientSmoothing/clientSmooth : When updating players information from the server, it can smooth them out.', 10, 210);
    this.ctx.fillText(' This only applies to other clients when prediction is enabled, and applies to local player with no prediction.', 170, 230);
  }
  this.ctx.fillStyle = 'rgba(255,255,255,1)'; //Reset fillstyle
};
GameCore.prototype.clientDrawServer = function () {
  if (!this.instance) {
    return;
  }
  this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
  this.ctx.fillText('Server: ' + this.instance.id, 0, this.world.height - 25);
  this.ctx.fillStyle = 'rgba(255,255,255,1)'; //Reset Fillstyle
};
