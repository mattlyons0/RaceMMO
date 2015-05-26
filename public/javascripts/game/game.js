var socket=io.connect('/');

socket.on('onconnected', function (data) {
  console.log('Connected successfully to the socket.io server. ID is ' + data.id);
});