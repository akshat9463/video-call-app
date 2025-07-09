import { Server } from "socket.io"

// connections: Keeps track of all socket IDs in a room.
// messages: Stores the chat messages per room.
let connections = {}
let messages = {}
let timeOnline = {}

export const connectToSocket = (server) => {

    // Sets up the io server and allows any origin to connect via GET/POST.
// Used to allow clients (e.g., React frontend) to connect across different origins.
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });


    // Called whenever a new user connects.
// socket is a unique connection representing a single client.
    io.on("connection", (socket) => {

        console.log("SOMETHING CONNECTED")

        // When a user joins a call (path is the room ID), do the following:
        socket.on("join-call", (path) => {

            //Create a new room if it doesn't exist.
            if (connections[path] === undefined) {
                connections[path] = []
            }
            //Add the user to that room’s socket list.
            connections[path].push(socket.id)


            // Track when the user joined.
            timeOnline[socket.id] = new Date();

            // connections[path].forEach(elem => {
            //     io.to(elem)
            // })

            // Notify all users in the room (including the newly joined one) that someone has joined, sending:
            // socket.id → the ID of the user who joined
            // connections[path] → current list of users in the room
            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
            }

            // If the room has previous messages stored, send them to the new user so they can see past chat history.
            if (messages[path] !== undefined) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
                }
            }

        });


        // Handles WebRTC signaling (offer/answer/ICE).
        // The sender sends a message to a specific peer toId, and the server relays it to that user.
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })

        socket.on("chat-message", (data, sender) => {

            // Find the room the sender is currently in.
            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {


                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }

                    return [room, isFound];

                }, ['', false]);

            // if current room has no messages than create message list.
            if (found === true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }

                // Store the message for history.
                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id })
                console.log("message", matchingRoom, ":", sender, data)

                // Broadcast the message to everyone in the room.
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id)
                })
            }

        })

        socket.on("disconnect", () => {

            // calculating user how long was online.
            var diffTime = Math.abs(timeOnline[socket.id] - new Date())

            var key

            // Loop through all rooms (k = room name, v = array of socket IDs).
            // If a user is found in the room:
            // Broadcast user-left to all others.
            // Remove that user from the room.
            // If the room is now empty, delete it.
            for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {

                for (let a = 0; a < v.length; ++a) {
                    if (v[a] === socket.id) {
                        key = k

                        for (let a = 0; a < connections[key].length; ++a) {
                            io.to(connections[key][a]).emit('user-left', socket.id)
                        }

                        var index = connections[key].indexOf(socket.id)

                        connections[key].splice(index, 1)


                        if (connections[key].length === 0) {
                            delete connections[key]
                        }
                    }
                }

            }


        });


    });


    return io;
}