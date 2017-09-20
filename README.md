# RaceMMO
A online racing game written in Node.js using Socket.io, Express and PIXI.js.

### Current Status
RaceMMO was intended to be a racing game. Since starting this project [RaceGame.io](http://racegame.io/) has launched which has many similarities to my original concept. As a result of this RaceMMO has turned into a currently abandoned proof of concept of creating a multiplayer game with entities over a network (featuring latency compensation and linear interpolation) moving cubes. 

See [Todo.html](https://github.com/mattlyons0/RaceMMO/blob/master/Todo.html) (Or run the server and Todo.html will be embedded into the homepage) for features not yet implemented, known bugs and possible additions in the future.


## Installation
*This has only been tested on linux and relies on bash for the run scripts.*
Clone Repo, run `npm install` to install dependencies, create the directory `public/javascripts` if it doesn't already exist,
run `npm run build` and then run `npm run start` which will start the server on port 3000 or the environment variable `PORT`.
Navigate to [http://localhost:3000](http://localhost:3000) to view server.

See [http://racemmo.com](http://racemmo.com) for more information.

The networking is based upon [Real Time Multiplayer in HTML5](http://buildnewgames.com/real-time-multiplayer/) by [Sven Bergstrom](http://underscorediscovery.com/)
