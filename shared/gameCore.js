/**
 * Runs on both client and server
 *
 * Handles Update Loop
 * Handles Animation when running on Client
 */

var frameTime = 60 / 1000; //Run client game logic at 60hz
if('undefined' != typeof(global)) frameTime = 45; //global is defined if used on server, run at 22hz on server

/**
 * Main update loop runs on requestAnimationFrame, which will fallback to a setTimout loop on the server
 */
( function (window) {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];

  for(var x=0;x<vendors.length&&!window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] ||
      window[vendors[x]+'CancelRequestAnimationFrame'];
  }

  if(!window.requestAnimationFrame) {
    window.requestAnimationFrame=function(callback,element) {
      var currentTime = Date.now();
      var timeToCall = Math.max(0, frameTime - (currentTime - lastTime));
      var id = window.setTimeout(function () { callback(currentTime + timeToCall) }, timeToCall);
      lastTime = currentTime + timeToCall;
      return id;
    };
  }
  if(!window.cancelAnimationFrame) {
    window.cancelAnimationFrame=function(id){
      clearTimeout(id);}
  }
})(typeof window == "undefined" ? global : window); //TODO check if this works correctly on clientside

/**
 * Main game class
 * Created on both client and server
 * @param gameInstance instance of game to run logic on
 */
var gameCore=function(gameInstance) {
  this.instance = gameInstance;
  this.server=this.instance !== undefined; //Store if we are the server
  this.world = {width: 720, height: 480};

  //Create player set and tell them the game is running
  if(this.server) {
    this.players = {
      self: new gamePlayer(this, this.instance.playerHost),
      other: new gamePlayer(this,this.instance.playerClient)
    };
  this.players.self.pos = {x: 20, y: 20}; //Starting Positions
  }
  else {
    this.players = {
      self: new gamePlayer(this),
      other: new gamePlayer(this)
    };
    //Display ghosts
    this.ghosts = {
      serverPosSelf: new gamePlayer(this), //Our ghost position on the server
      serverPosOther: new gamePlayer(this), //The other player's server position
      posOther: new gamePlayer(this) //The other players lerp position
    };
    //Setup Ghosts
    this.ghosts.posOther.infoColor = 'rgba(255,255,255,0.1)';
    this.ghosts.serverPosSelf.infoColor = 'rgba(255,255,255,0.2)';
    this.ghosts.serverPosOther.infoColor = 'rgba(255,255,255,0.2)';
    this.ghosts.posOther.state = 'destPos';
    this.ghosts.serverPosSelf.state = 'serverPos';
    this.ghosts.serverPosOther.state = 'serverPos';
    this.ghosts.serverPosSelf.pos = {x: 20, y: 20};
    this.ghosts.posOther.pos = {x: 500, y: 200};
    this.ghosts.serverPosOther.pos = {x: 500, y: 200};
  }

  this.playerSpeed = 120; //Movespeed
  //Setup Physics Vars
  this._pdt = 0.0001; //Physics delta time
  this._pdte = new Date().getTime(); //Physics last delta time
  //Timer to sync client with server
  this.localTime = 0.016; //Local Timer
  this._dt = new Date().getTime(); //Timer Delta
  this._dte = new Date().getTime(); //Timer Delta from last frame time

  //Start physics loop, happens at different frequency than rendering
  this.createPhysicsSimulation();
  this.createTimer(); //Create fast timer to measure time

  //ClientSide Only Init
  if(!this.server) {
    this.keyboard = new THREEx.KeyboardState(); //Keyboard Handler
    this.clientCreateConfiguration(); //Create Default Settings for client
    this.serverUpdates = []; //List of recent server updates so we can interpolate
    this.clientConnectToServer(); //Connect to the socket.io server
    this.clientCreatePingTimer(); //Start pinging server and determine latency
    this.color = localStorage.getItem('color') || '#cc8822'; //Get color from localStorage or use default
    localStorage.setItem('color', this.color);
    this.players.self.color = this.color; //Set Players color

    //Make debug gui if requested
    if(String(window.location).indexOf('debug')!=-1) {
      this.clientCreateDebugGui();
    }
  }
  else { //if we are running this serverside
    this.serverTime = 0;
    this.lastState = {};
  }
}; //gameCore constructor

//serverside we set gameCore as the global type
if('undefined' != typeof global) {
  module.exports = global.gameCore = gameCore;
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
gameCore.prototype.pos=function(a) {
  return {x: a.x, y: a.y};
};
/**
 * Add 2d vectors
 * @param a vector 1 to add
 * @param b vector 2 to add
 * @returns {{x: (Number|string), y: (Number|string)}} the resulting vector after vector addition
 */
gameCore.prototype.vAdd=function(a,b) {
  return {x: (a.x + b.x).fixed(), y: (a.y + b.y).fixed()};
};
/**
 * Subtract 2d vectors
 * @param a vector 1 to subtract
 * @param b vector 2 to subtract
 * @returns {{x: Number, y: Number}} the resulting vector after subracting a from b
 */
gameCore.prototype.vSub=function(a,b) {
  return {x: (a.x - b.x).fixed(), y: (a.y - b.y).fixed()};
};
/**
 * Multiply a vector by a scalar
 * @param a vector
 * @param b scalar
 * @returns {{x: Number, y: Number}} the result of the scalar multiplication
 */
gameCore.prototype.vMultScalar=function(a,b) {
  return {x: (a.x * b).fixed(), y: (a.y * b).fixed()};
};
/**
 * For the server, cancel the setTimeout
 */
gameCore.prototype.stopUpdate = function () {
  window.cancelAnimationFrame(this.updateID);
};
/**
 * Simple linear interpolation TODO find out what this does
 * @param p
 * @param n
 * @param t
 * @returns {Number|string}
 */
gameCore.prototype.lerp=function(p,n,t) {
  var _t = Number(t);
  _t = (Math.max(0, Math.min(1, _t))).fixed();
  return (p + _t * (n - p)).fixed();
};
/**
 * Simple linear interpolation between 2 vectors TODO find out what this does
 * @param v
 * @param tv
 * @param t
 * @returns {{x: (Number|string), y: (Number|string)}}
 */
gameCore.prototype.vLerp=function(v,tv,t) {
  return {x: this.lerp(v.x, tv.x, t), y: this.lerp(v.y, tv.y, t)};
};

/**
 * Player Class, manage player state and draw if needed
 * @param gameInstance instance of game
 * @param playerInstance instance of player
 */
var gamePlayer=function(gameInstance,playerInstance) {
  //Store Instance
  this.instance = playerInstance;
  this.game = gameInstance;

  //Setup State
  this.pos = {x: 0, y: 0};
  this.size = {x: 16, y: 16, hx: 8, hy: 8}; //x,y,heightX,heightY
  this.state = 'notConnected';
  this.color = 'rgba(255,255,255,0.1)';
  this.infoColor = 'rgba(255,255,255,0.1)';
  this.id = ''; //Will be assigned later

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

  if(playerInstance) { //If host top left corner
    this.pos = {x: 20, y: 20};
  }
  else { //Other player bottom right
    this.pos = {x: 500, y: 200};
  }
};

/**
 *
 */
gamePlayer.prototype.draw=function() {
  //Draw Player Rectangle
  game.ctx.fillStyle = this.color;
  game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);
  //Draw Player Status
  game.ctx.fillStyle=this.infoColor;
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
gameCore.prototype.update=function(t) {
  this.dt = this.lastFrameTime ? ( (t - this.lastFrameTime) / 1000.0).fixed() : 0.016; //Calculate Delta Time
  this.lastFrameTime = t;
  if(!this.server) { //If we arent the server, update the client, otherwise update the server
    this.clientUpdate();
  } else {
    this.serverUpdate();
  }
  this.updateID = window.requestAnimationFrame(this.update.bind(this), this.viewport); //Schedule next update
};
/**
 * Check collision between the world bounds and the item
 * @param item item to check against the world bounds
 */
gameCore.prototype.checkCollision=function(item) {
  if(item.pos.x <= item.posLimits.xMin) { //Left Wall
    item.pos.x = item.posLimits.xMin;
  }
  if(item.pos.x >= item.posLimits.xMax) { //Right Wall
    item.pos.x = item.posLimits.xMax;
  }
  if(item.pos.y <= item.posLimits.yMin) { //Top Wall
    item.pos.y = item.posLimits.yMin;
  }
  if(item.pos.y >= item.posLimits.yMax) { //Bottom Wall
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
gameCore.prototype.processInput=function(player) {
  var xDir = 0;
  var yDir = 0;
  var ic = player.inputs.length; //Input Count
  if(ic) {
    for(var x=0; x<ic; ++x) {
      if(player.inputs[x].seq <= player.lastInputSeq) continue; //Skip if we have simulated it locally

      var input = player.inputs[x].inputs;
      var c = input.length;
      for(var i=0; i < c; ++i) {
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
  if(player.inputs.length) {
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
gameCore.prototype.physicsMovementVectorFromDirection=function(x,y) {
  //Must be fixed step at physics sync speed
  return {
    x: (x*(this.playerSpeed*0.015)).fixed(3),
    y: (y*(this.playerSpeed*0.015)).fixed(3)
  };
};
/**
 * Update physics callable from both client and server
 */
gameCore.prototype.updatePhysics=function() {
  if(this.server) {
    this.serverUpdatePhysics();
  } else {
    this.clientUpdatePhysics();
  }
};

/*
SERVER FUNCTIONS
  Functions specifically for serverSide only
 */
/**
 * Updated every 15ms, simulates world state
 */
gameCore.prototype.serverUpdatePhysics=function() {
  //Player 1
  this.players.self.oldState.pos = this.pos(this.players.self.pos);
  var newDir = this.processInput(this.players.self);
  this.players.self.pos = this.vAdd(this.players.self.oldState.pos, newDir);

  //Player 2
  this.players.other.oldState.pos = this.pos(this.players.other.pos);
  var otherNewDir = this.processInput(this.players.other);
  this.players.other.pos = this.vAdd(this.players.other.oldState.pos, otherNewDir);

  //Do Collision
  this.checkCollision(this.players.self);
  this.checkCollision(this.players.other);

  //Remove inputs queue becuase they were processed
  this.players.self.inputs = [];
  this.players.other.inputs = [];
};
/**
 * Notify clients of changes to player states
 */
gameCore.prototype.serverUpdate=function() {
  this.serverTime = this.localTime; //Update our clock to match timer
  this.lastState = { //Snapshot current state for updating clients
    hp: this.players.self.pos, //Host Pos
    cp: this.players.other.pos, //Client Pos
    his: this.players.self.lastInputSeq, //Host input seq
    cis: this.players.other.lastInputSeq, //Client input seq
    t: this.serverTime //Time local to server
  };

  if(this.players.self.instance) { //Send snapshot to host player
    this.players.self.instance.emit('onserverupdate', this.lastState);
  }
  if(this.players.other.instance) { //Send snapshot to other player
    this.players.other.instance.emit('onserverupdate', this.lastState);
  }
};
/**
 * Ensure input gets put in the array properly
 * @param client client making the inputs
 * @param input input given
 * @param inputTime time input was given
 * @param inputSeq sequence of inputs
 */
gameCore.prototype.handleServerInput=function(client,input,inputTime,inputSeq) {
  var playerClient = (client.userID == this.players.self.instance.userID) ? this.players.self : this.players.other; //Figure out which player gave the input
  playerClient.inputs.push({inputs: input, time: inputTime, seq: inputSeq}); //Push into array
};

/*
CLIENTSIDE FUNCTIONS
  Functions for clientside only
 */

/**
 * Handle input clientside
 *  Parse Input and send to server
 *  @returns {*} Movement Vector from resulting input
 */
gameCore.prototype.clientHandleInput=function() {
  var xDir = 0;
  var yDir = 0;
  var input = [];
  this.clientHasInput = false;

  if(this.keyboard.pressed('A') || this.keyboard.pressed('left')) {
    xDir = -1;
    input.push('l');
  }
  if(this.keyboard.pressed('D') || this.keyboard.pressed('right')) {
    xDir = 1;
    input.push('r');
  }
  if(this.keyboard.pressed('S') || this.keyboard.pressed('down')) {
    yDir = 1;
    input.push('d');
  }
  if(this.keyboard.pressed('W') || this.keyboard.pressed('up')) {
    yDir = -1;
    input.push('u');
  }

  if(input.length) {
    this.inputSeq += 1;
    this.players.self.inputs.push({ //Store input state as snapshot
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
  }
  else{
    return {x: 0, y: 0};
  }
};
/**
 * Calculate Client Prediction
 */
gameCore.prototype.clientProcessNetPredictionCorrection=function() {
  if(!this.serverUpdates.length) return; //Nothing to do if there are no updates

  var latestServerData = this.serverUpdates[this.serverUpdates.length - 1];
  var myServerPos = this.players.self.host ? latestServerData.hp : latestServerData.cp; //Get the client position
  this.ghosts.serverPosSelf.pos = this.pos(myServerPos); //Update Ghost with real position

  //Local Input Prediction
  var myLastInputOnServer = this.players.self.host ? latestServerData.his : latestServerData.cis;
  if(myLastInputOnServer) {
    var lastInputSeqIndex = -1; //Last input sequence from my input
    //Find input on server
    for(var i=0;i<this.players.self.inputs.length;++i) {
      if(this.players.self.inputs[i].seq==myLastInputOnServer) {
        lastInputSeqIndex=i;
        break;
      }
    }
    if(lastInputSeqIndex!=-1) { //Server acknowleges that our inputs were accepted
      var numberToClear = Math.abs(lastInputSeqIndex - (-1)); //Clear inputs we confirmed are on server
      this.players.self.inputs.splice(0, numberToClear);
      this.players.self.currentState.pos = this.pos(myServerPos); //We know we are at this position because the server confirmed it
      this.players.self.lastInputSeq = lastInputSeqIndex;
      //Reapply all inputs that the server hasn't yet confirmed to 'keep' our position the same while confirming the server position
      this.clientUpdatePhysics();
      this.clientUpdateLocalPosition();
    }
  }
};
/**
 * Process updates from the server
 */
gameCore.prototype.clientProcessNetUpdates=function() {
  if(!this.serverUpdates.length) return; //Nothing to do if there are no updates

  //Find the position in the timeline of the updates we store
  var currentTime = this.clientTime;
  var count = this.serverUpdates.length - 1;
  var target = null;
  var previous = null;

  //Look for oldest update since newest ones are at the end, if our time isn't on timeline it will be very expensive!
  for(var i=0;i<count;++i) {
    var point = this.serverUpdates[i];
    var nextPoint = this.serverUpdates[i + 1];

    if(currentTime>point.t&&currentTime<nextPoint.t) {
      target=nextPoint;
      previous = point;
      break;
    }
  }
  if(!target) { //use last known server pos and move to it
    target = this.serverUpdates[0];
    previous = this.serverUpdates[0];
  }

  //Interpolate between target and previous destination
  if(target&&previous) {
    this.targetTime = target.t;
    var difference = this.targetTime - currentTime;
    var maxDifference = (target.t - previous.t).fixed(3);
    var timePoint = (difference / maxDifference).fixed(3);

    //Safeguard extreme cases (divide by 0)
    if(isNaN(timePoint))timePoint = 0;
    if(timePoint==-Infinity)timePoint = 0;
    if(timePoint==Infinity)timePoint = 0;

    var latestServerData = this.serverUpdates[this.serverUpdates.length - 1];
    var otherServerPos = this.players.self.host ? latestServerData.cp : latestServerData.hp; //The exact server positions, used for the ghost
    //Other player's locations in timeline
    var otherTargetPos = this.players.self.host ? target.cp : target.hp;
    var otherPastPos = this.players.self.host ? previous.cp : previous.hp;

    //Update destination block
    this.ghosts.serverPosOther.pos = this.pos(otherServerPos);
    this.ghosts.posOther.pos = this.vLerp(otherPastPos, otherTargetPos, timePoint); //Linear interpolation between past and target position at a given time

    if(this.clientSmoothing){
      this.players.other.pos = this.vLerp(this.players.other.pos, this.ghosts.posOther.pos, this._pdt * this.clientSmooth);
    } else {
      this.players.other.pos = this.pos(this.ghosts.posOther.pos);
    }

    if(!this.clientPredict && !this.naiveApproach) { //maintain local player position using same method, smoothing using info from past
      var myServerPos = this.players.self.host ? latestServerData.hp : latestServerData.cp;
      var myTargetPos = this.players.self.host ? target.hp : target.cp;
      var myPastPos = this.players.self.host ? previous.hp : previous.cp;

      this.ghosts.serverPosSelf.pos = this.pos(myServerPos); //Snap ghost to new server pos
      var localTarget = this.vLerp(myPastPos, myTargetPos, timePoint);

      if(this.clientSmoothing) {
        this.players.self.pos = this.vLerp(this.players.self.pos, localTarget, this._pdt * this.clientSmooth);
      } else {
        this.players.self.pos = this.pos(localTarget);
      }
    }
  }
};
/**
 * Process updates from the server
 * @param data update packet received from the server
 */
gameCore.prototype.clientOnServerUpdateReceived=function(data) {
  var playerHost = this.players.self.host ? this.players.self : this.players.other;
  var playerClient = this.players.self.host ? this.players.other : this.players.self;
  var thisPlayer = this.players.self;

  this.serverTime = data.t; //Server time (can be used to calc latency)
  this.clientTime = this.serverTime - (this.netOffset / 1000); //Latency Offset

  if(this.naiveApproach) {
    if(data.hp) {
      playerHost.pos = this.pos(data.hp);
    }
    if(data.cp) {
      playerClient.pos = this.pos(data.cp);
    }
  } else {
    //Cache data from server, play it back with the netOffset and interpolate between points
    this.serverUpdates.push(data);
    //Limit buffer in seconds of updates 60fps*bufferSeconds=samples
    if(this.serverUpdates.length>=(60*this.bufferSize)) {
      this.serverUpdates.splice(0, 1);
    }
    this.oldestTick = this.serverUpdates[0].t; //If the client gets behind this due to latency, we snap them to the latest tick (only if connection is really bad)
    this.clientProcessNetPredictionCorrection();
  }
};
/**
 * Update client position and states
 */
gameCore.prototype.clientUpdateLocalPosition=function() {
  if(this.clientPredict) {
    var t = (this.localTime - this.players.self.stateTime) / this._pdt; //Time since updated state
    var oldState = this.players.self.oldState.pos;
    var currentState = this.players.self.currentState.pos;

    this.players.self.pos = currentState; //Ensure visual position matches state
    this.checkCollision(this.players.self); //Keep in world
  }
};
/**
 * Calculate Physics clientside
 */
gameCore.prototype.clientUpdatePhysics=function() {
  if(this.clientPredict) {
    //Fetch the direction from input buffer and use it to smooth visuals
    this.players.self.oldState.pos = this.pos(this.players.self.currentState.pos);
    var nd = this.processInput(this.players.self); //new direction vector
    this.players.self.currentState.pos = this.vAdd(this.players.self.oldState.pos, nd);
    this.players.self.stateTime = this.localTime;
  }
};
/**
 * Client Update Loop
 *  Draw, Input, Physics
 */
gameCore.prototype.clientUpdate=function() {
  this.ctx.clearRect(0, 0, 720, 480);
  this.clientDrawInfo();
  this.clientHandleInput();
  if(!this.naiveApproach) {
    this.clientProcessNetUpdates();
  }
  this.players.other.draw();
  this.clientUpdateLocalPosition();
  this.players.self.draw();

  if(this.showDestPos&&!this.naiveApproach) {
    this.ghosts.posOther.draw(); //Draw Other Ghost
  }
  if(this.showServerPos&&!this.naiveApproach) {
    this.ghosts.serverPosSelf.draw(); //Draw our ghost
    this.ghosts.serverPosOther.draw();
  }
  this.clientRefreshFPS(); //Calculate FPS Average
};
/**
 * Create Timer to update deltas
 */
gameCore.prototype.createTimer=function() {
  setInterval(function () {
    this._dt = new Date().getTime() - this._dte;
    this._dte = new Date().getTime();
    this.localTime += this._dt / 1000.0;
  }.bind(this, 4)); //250x a second
};
/**
 * Create Timer to update physics simulation
 */
gameCore.prototype.createPhysicsSimulation=function() {
  setInterval(function () {
    this._pdt = (new Date().getTime() - this._pdte) / 1000.0;
    this._pdte = new Date().getTime();
    this.updatePhysics();
  }.bind(this), 15); //66x a second physics loop
};
/**
 * Make a ping between the client and server every second to ensure they are connected
 */
gameCore.prototype.clientCreatePingTimer=function() {
  setInterval(function () {
    this.lastPingTime = new Date().getTime() - this.fakeLag;
    this.socket.send('p.' + (this.lastPingTime)); //'p' for ping
  }.bind(this, 1000));
};
/**
 * Setup Client Configuration
 * Initialize Client Vars
 */
gameCore.prototype.clientCreateConfiguration=function() {
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
  this.fakeLag = 0; //If we are simulating lag on the client

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
gameCore.prototype.clientCreateDebugGui=function() {
  this.gui = new dat.GUI();

  var _playerSettings = this.gui.addFolder('Your Settings');
  this.colorControl = _playerSettings.addColor(this, 'color');
  this.colorControl.onChange(function (value) {
    this.players.self.color = value;
    localStorage.setItem('color', value);
    this.socket.send('c.' + value); //'c' for color
  }.bind(this));
  _playerSettings.open();

  var _otherSettings = this.gui.addFolder('Methods');
  _otherSettings.add(this, 'naiveApproach').listen();
  _otherSettings.add(this, 'clientSmoothing').listen();
  _otherSettings.add(this, 'clientSmooth').min(0).listen();
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

  var lagControl = _conSettings.add(this, 'fakeLag').min(0).step(2).listen();
  lagControl.onChange(function (value) { //Notify Server Fake Lag has been enabled
    this.socket.send('l.' + value); //'l' for lag
  }.bind(this));
  _conSettings.open();

  var _netSettings = this.gui.addFolder('Networking');
  _netSettings.add(this, 'netOffset').min(0.01).step(1).listen();
  _netSettings.add(this, 'serverTime').step(0.01).listen();
  _netSettings.add(this, 'clientTime').step(0.01).listen();
  _netSettings.open();
};
/**
 * Reset the positions of clients
 */
gameCore.prototype.clientResetPositions = function () {
  var playerHost = this.players.self.host ? this.players.self : this.players.other;
  var playerClient = this.players.self.host ? this.players.other : this.players.self;

  playerHost.pos = {x: 20, y: 20};
  playerClient.pos = {x: 500, y: 200};

  this.players.self.oldState.pos = this.pos(this.players.self.pos);
  this.players.self.pos = this.pos(this.players.self.pos);
  this.players.self.currentState.pos = this.pos(this.players.self.pos);

  this.ghosts.serverPosSelf.pos = this.pos(this.players.self.pos);

  this.ghosts.serverPosOther.pos = this.pos(this.players.other.pos);
  this.ghosts.posOther.pos = this.pos(this.players.other.pos);
};
/**
 * Handle connection when the game is ready to start
 * @param data Parsed Data from Server
 */
gameCore.prototype.clientOnReadyGame=function(data) {
  var serverTime = parseFloat(data.replace('-', '.'));

  var playerHost = this.players.self.host ? this.players.self : this.players.other;
  var playerClient = this.players.self.host ? this.players.other : this.players.self;

  this.localTime = serverTime + this.netLatency;
  console.log('Server Time: ' + this.localTime);

  playerHost.infoColor = '#2288cc'; //Host is always blue
  playerClient.infoColor = '#cc8822';

  playerHost.state = 'localPos(hosting)';
  playerClient.state = 'localPos(joined)';

  this.players.self.state = 'YOU ' + this.players.self.state;

  this.socket.send('c.' + this.players.self.color); //Sync Colors 'c' for color
};
/**
 * Handle Joining Game
 * @param data  Parsed Data from Server
 */
gameCore.prototype.clientOnJoinGame=function(data) {
  this.players.self.host = false; //If this is called we are not host
  this.players.self.state = 'connected.joined.waiting';
  this.players.self.infoColor = '#00bb00';

  this.clientResetPositions();
};
/**
 * Server says we are hosting the game
 * @param data  Parsed Data from Server
 */
gameCore.prototype.clientOnHostGame=function(data) {
  var serverTime = parseFloat(data.replace('-', '.'));
  var localTime = serverTime + this.netLatency; //Estimate current time on server
  this.players.self.host = true;

  this.players.self.state = 'hosting.waiting for a player';
  this.players.self.infoColor = '#cc0000';

  this.clientResetPositions();
};
/**
 * Server gave us a game
 * @param data  Parsed Data from Server
 */
gameCore.prototype.clientOnConnected=function(data) {
  this.players.self.id = data.id;
  this.players.self.infoColor = '#cc0000';
  this.players.self.state = 'connected';
  this.players.self.online = true;
};
/**
 * Called when the other client changes its color
 * @param data  Parsed Data from Server
 */
gameCore.prototype.clientOnOtherClientColorChange=function(data) {
  this.players.other.color = data;
};
/**
 * Upon being pinged by server
 * @param data  Parsed Data from Server
 */
gameCore.prototype.clientOnPing=function(data) {
  this.netPing = new Date().getTime() - parseFloat(data);
  this.netLatency = this.netPing / 2;
};
/**
 * Called when any message from a server is received
 * @param data server packet received
 */
gameCore.prototype.clientOnNetMessage=function(data) {
  var commands = data.split('.'); //'.' delimits commands
  var command = commands[0];
  var subcommand = commands[1] || null;
  var commandData = commands[2] || null;

  switch (command) {
    case 's': //Server Message
      switch (subcommand) {
        case 'h': //host game requested
          this.clientOnHostGame(commandData);
          break;
        case 'j': //join game requested
          this.clientOnJoinGame(commandData);
          break;
        case 'r': //game is ready to start
          this.clientOnReadyGame(commandData);
          break;
        case 'e': //Game has ended
          this.clientOnDisconnect(commandData);
          break;
        case 'p': //Server Ping
          this.clientOnPing(commandData);
          break;
        case 'c': //Other player color changed
          this.clientOnOtherClientColorChange(commandData);
          break;
      }
      break; //If its anything but a server message we ignore it
  }
};
/**
 * Called once the client is requested to disconnect because the game is over
 * @param data data from disconnect command
 */
gameCore.prototype.clientOnDisconnect=function(data) {
  //We don't know if the other player is still connected, we arent so everything goes offline
  this.players.self.infoColor = 'rgba(255,255,255,0.1)';
  this.players.self.state = 'not-connected';
  this.players.self.online = false;

  this.players.other.infoColor = 'rgba(255,255,255,0.1)';
  this.players.other.state = 'not-connected';
};
/**
 * Handle Connecting to the server
 */
gameCore.prototype.clientConnectToServer=function() {
  this.socket = io.connect();

  this.socket.on('connect', function () {
    this.players.self.state = 'connecting'; //We are not 'connected' until we have a server ID and we are placed in a server
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
gameCore.prototype.clientRefreshFPS= function () {
  //Store the fps for 10 frames
  this.fps = 1 / this.dt;
  this.fpsAvgAcc += this.fps;
  this.fpsAvgCount++;

  if(this.fpsAvgCount>=10) {
    this.fpsAvg = this.fpsAvgAcc / 10;
    this.fpsAvgCount = 1;
    this.fpsAvgAcc = this.fps;
  }
};

gameCore.prototype.clientDrawInfo=function() {
  this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
  if(this.showHelp) {
    this.ctx.fillText('netOffset : local offset between players and their server updates.', 10 , 30);
    this.ctx.fillText('serverTime : last known game time on server', 10 , 70);
    this.ctx.fillText('clientTime : delayed game time on client for other players only (includes the net_offset)', 10 , 90);
    this.ctx.fillText('netLatency : Time from you to the server. ', 10 , 130);
    this.ctx.fillText('netPing : Time from you to the server and back. ', 10 , 150);
    this.ctx.fillText('fakeLag : Add fake ping/lag for testing, applies only to your inputs (watch server_pos block!). ', 10 , 170);
    this.ctx.fillText('clientSmoothing/clientSmooth : When updating players information from the server, it can smooth them out.', 10 , 210);
    this.ctx.fillText(' This only applies to other clients when prediction is enabled, and applies to local player with no prediction.', 170 , 230);
  }
  if(this.players.self.host) {
    this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
    this.ctx.fillText('You are the host', 10, 465);
  }
  this.ctx.fillStyle = 'rgba(255,255,255,1)'; //Reset fillstyle
};