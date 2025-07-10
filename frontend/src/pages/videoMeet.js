import React, { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import server from "../environment"; // Assuming 'server' is still defined here

const server_url = server;

// Store connections outside the component to persist across renders
var connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Helper functions for black and silence streams
const silence = () => {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const dst = oscillator.connect(ctx.createMediaStreamDestination());
  oscillator.start();
  ctx.resume();
  return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
};

const black = ({ width = 640, height = 480 } = {}) => {
  const canvas = Object.assign(document.createElement("canvas"), {
    width,
    height,
  });
  canvas.getContext("2d").fillRect(0, 0, width, height);
  const stream = canvas.captureStream();
  return Object.assign(stream.getVideoTracks()[0], { enabled: false });
};

// Custom Styles as JavaScript Objects
const customStyles = {
  lobbyContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#282c34",
    color: "white",
    padding: "20px",
    boxSizing: "border-box",
  },
  localVideoPreview: {
    marginTop: "20px",
    border: "1px solid #444",
    borderRadius: "8px",
    overflow: "hidden",
  },
  localVideoPreviewVideo: {
    width: "320px",
    height: "240px",
    backgroundColor: "black",
  },
  meetVideoContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    // backgroundColor: '#1a1a1a',
    color: "white",
    padding: "20px",
    boxSizing: "border-box",
    position: "relative",
  },
  buttonControls: {
    position: "fixed",
    bottom: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: "15px",
    padding: "10px 20px",
    display: "flex",
    gap: "15px",
    zIndex: 100,
  },
  meetUserVideo: {
    width: "100%",
    maxWidth: "640px",
    height: "auto",
    maxHeight: "480px",
    backgroundColor: "black",
    borderRadius: "8px",
    border: "2px solid #555",
    marginBottom: "20px",
  },
  conferenceView: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    width: "100%",
    maxWidth: "1200px",
    marginTop: "20px",
  },
  remoteVideoWrapper: {
    backgroundColor: "black",
    borderRadius: "8px",
    overflow: "hidden",
    border: "2px solid #007bff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  remoteVideo: {
    width: "100%",
    height: "auto",
    minHeight: "200px", // Ensure a minimum height for remote videos
    objectFit: "cover",
  },
  chatRoom: {
    position: "fixed",
    top: "0",
    right: "0",
    width: "350px",
    height: "100%",
    backgroundColor: "#2e333d",
    zIndex: "200",
    display: "flex",
    flexDirection: "column",
    boxShadow: "-5px 0 15px rgba(0,0,0,0.5)",
  },
  chatContainer: {
    flexGrow: "1",
    display: "flex",
    flexDirection: "column",
    padding: "15px",
  },
  chattingDisplay: {
    flexGrow: "1",
    overflowY: "auto",
    backgroundColor: "#3b4049",
    borderRadius: "5px",
    padding: "10px",
    marginBottom: "10px",
    color: "#e0e0e0",
  },
  chattingArea: {
    display: "flex",
    gap: "10px",
  },
  // Add more styles as needed
};

export default function VideoMeetComponent() {
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);
  const lobbyVideoRef = useRef(null);
  const meetingVideoRef = useRef(null);
  const chatDisplayRef = useRef(null); // Ref for chat scroll

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [showChatModal, setShowChatModal] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState(false);

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [newMessagesCount, setNewMessagesCount] = useState(0);

  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");

  const [remoteVideos, setRemoteVideos] = useState([]);

  // ---
  // Permissions and Local Stream Management
  // ---

 useEffect(() => {
  const getPermissionsAndStream = async () => {
    try {
      const userMediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Save to global
      window.localStream = userMediaStream;

      // Set refs
      if (lobbyVideoRef.current) {
        lobbyVideoRef.current.srcObject = userMediaStream;
      }
      if (meetingVideoRef.current) {
        meetingVideoRef.current.srcObject = userMediaStream;
      }

      // Set states
      setVideoEnabled(true);
      setAudioEnabled(true);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

    } catch (error) {
      console.error("Error accessing media devices:", error);

      // Fallback: black screen + silent audio
      const fallbackStream = new MediaStream([black(), silence()]);
      window.localStream = fallbackStream;

      if (lobbyVideoRef.current) {
        lobbyVideoRef.current.srcObject = fallbackStream;
      }
      if (meetingVideoRef.current) {
        meetingVideoRef.current.srcObject = fallbackStream;
      }

      setVideoEnabled(false);
      setAudioEnabled(false);
      setScreenAvailable(false);
    }
  };

  getPermissionsAndStream();

  return () => {
    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    for (const id in connections) {
      if (connections[id]) {
        connections[id].close();
        delete connections[id];
      }
    }
  };
}, []);

useEffect(() => {
  if (!askForUsername && meetingVideoRef.current && window.localStream) {
    meetingVideoRef.current.srcObject = window.localStream;
  }
}, [askForUsername]);

  // ---
  // Media Control Functions
  // ---

  const updateLocalStreamTracks = useCallback(() => {
    if (!window.localStream) return;

    for (const id in connections) {
      const peerConnection = connections[id];
      if (peerConnection && peerConnection.getSenders) {
        window.localStream.getTracks().forEach((newTrack) => {
          const sender = peerConnection
            .getSenders()
            .find((s) => s.track && s.track.kind === newTrack.kind);
          if (sender) {
            sender
              .replaceTrack(newTrack)
              .catch((e) => console.error("Error replacing track:", e));
          } else {
            peerConnection.addTrack(newTrack, window.localStream);
          }
        });
        if (peerConnection.negotiationNeeded) {
          peerConnection
            .createOffer()
            .then((offer) => peerConnection.setLocalDescription(offer))
            .then(() => {
              socketRef.current.emit(
                "signal",
                id,
                JSON.stringify({ sdp: peerConnection.localDescription })
              );
            })
            .catch((e) =>
              console.error("Error creating offer after track update:", e)
            );
        }
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (!window.localStream) return;
    const videoTrack = window.localStream.getVideoTracks()[0];

    if (videoTrack) {
      const newStatus = !videoTrack.enabled;
      videoTrack.enabled = newStatus;
      setVideoEnabled(newStatus);
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (!window.localStream) return;
    const audioTrack = window.localStream.getAudioTracks()[0];

    if (audioTrack) {
      const newStatus = !audioTrack.enabled;
      audioTrack.enabled = newStatus;
      setAudioEnabled(newStatus);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!screenAvailable) {
      alert("Screen sharing is not available in your browser.");
      return;
    }

    if (screenSharing) {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
      try {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled,
          audio: audioEnabled,
        });
        window.localStream = userMediaStream;
        if (meetingVideoRef.current) {
          meetingVideoRef.current.srcObject = userMediaStream;
        }
        setScreenSharing(false);
      } catch (error) {
        console.error("Error reverting to camera/mic:", error);
        window.localStream = new MediaStream([black(), silence()]);
        if (meetingVideoRef.current) {
          meetingVideoRef.current.srcObject = window.localStream;
        }
        setVideoEnabled(false);
        setAudioEnabled(false);
        setScreenSharing(false);
      } finally {
        updateLocalStreamTracks();
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        if (window.localStream) {
          window.localStream.getTracks().forEach((track) => track.stop());
        }
        window.localStream = screenStream;
        if (meetingVideoRef.current) {
          meetingVideoRef.current.srcObject = screenStream;
        }
        setScreenSharing(true);
        screenStream.getVideoTracks()[0].onended = () => {
          console.log("Screen share stopped by user or system.");
          toggleScreenShare();
        };
      } catch (error) {
        console.error("Error starting screen share:", error);
        setScreenSharing(false);
      } finally {
        updateLocalStreamTracks();
      }
    }
  }, [
    screenSharing,
    videoEnabled,
    audioEnabled,
    screenAvailable,
    updateLocalStreamTracks,
  ]);

  const handleEndCall = useCallback(() => {
    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    for (const id in connections) {
      if (connections[id]) {
        connections[id].close();
        delete connections[id];
      }
    }
    window.location.href = "/";
  }, []);

  // ---
  // Socket.IO and WebRTC Signaling
  // ---

  const addPeerConnection = useCallback((id) => {
    if (connections[id]) return;

    const peerConnection = new RTCPeerConnection(peerConfigConnections);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit(
          "signal",
          id,
          JSON.stringify({ ice: event.candidate })
        );
      }
    };

    peerConnection.ontrack = (event) => {
      setRemoteVideos((prevVideos) => {
        const existingVideo = prevVideos.find((v) => v.socketId === id);
        if (existingVideo) {
          if (existingVideo.stream !== event.streams[0]) {
            console.log(`Updating stream for existing peer ${id}`);
            return prevVideos.map((v) =>
              v.socketId === id ? { ...v, stream: event.streams[0] } : v
            );
          }
          return prevVideos;
        } else {
          console.log(`Adding new remote video for peer ${id}`);
          return [...prevVideos, { socketId: id, stream: event.streams[0] }];
        }
      });
    };

    if (window.localStream) {
      window.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, window.localStream);
      });
    }

    connections[id] = peerConnection;
    return peerConnection;
  }, []);

  const gotMessageFromServer = useCallback(
    (fromId, message) => {
      const signal = JSON.parse(message);
      const peerConnection = connections[fromId];

      if (!peerConnection) {
        console.warn(
          `No peer connection found for ${fromId}, creating a new one.`
        );
        addPeerConnection(fromId);
        return;
      }

      if (signal.sdp) {
        peerConnection
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              peerConnection
                .createAnswer()
                .then((description) =>
                  peerConnection.setLocalDescription(description)
                )
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    fromId,
                    JSON.stringify({ sdp: peerConnection.localDescription })
                  );
                })
                .catch((e) =>
                  console.error("Error creating or setting answer:", e)
                );
            }
          })
          .catch((e) => console.error("Error setting remote description:", e));
      } else if (signal.ice) {
        peerConnection
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.error("Error adding ICE candidate:", e));
      }
    },
    [addPeerConnection]
  );

  const connectToSocketServer = useCallback(() => {
    if (socketRef.current) return;

    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketIdRef.current = socketRef.current.id;
      socketRef.current.emit("join-call", window.location.href);

      socketRef.current.on("chat-message", addMessage);

      socketRef.current.on("user-left", (id) => {
        console.log(`User ${id} left`);
        setRemoteVideos((prevVideos) =>
          prevVideos.filter((video) => video.socketId !== id)
        );
        if (connections[id]) {
          connections[id].close();
          delete connections[id];
        }
      });

      socketRef.current.on("user-joined", (id, clients) => {
        console.log(`User ${id} joined. All clients:`, clients);

        clients.forEach((socketListId) => {
          if (socketListId === socketIdRef.current) return;
          addPeerConnection(socketListId);
        });

        if (id === socketIdRef.current) {
          clients.forEach((clientId) => {
            if (clientId === socketIdRef.current) return;
            const peerConnection = connections[clientId];
            if (peerConnection) {
              peerConnection
                .createOffer()
                .then((description) =>
                  peerConnection.setLocalDescription(description)
                )
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    clientId,
                    JSON.stringify({ sdp: peerConnection.localDescription })
                  );
                })
                .catch((e) =>
                  console.error("Error creating offer for new peer:", e)
                );
            }
          });
        }
      });
    });

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from socket server");
    });
    socketRef.current.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
    });
  }, [gotMessageFromServer, addPeerConnection]);

  // ---
  // Chat Functions
  // ---

  const addMessage = useCallback((data, sender, socketIdSender) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: sender, data: data, timestamp: Date.now() },
    ]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessagesCount((prevCount) => prevCount + 1);
    }
  }, []);

  const handleMessageInput = useCallback((e) => {
    setMessageInput(e.target.value);
  }, []);

  const sendMessage = useCallback(() => {
    if (messageInput.trim() === "") return;
    if (socketRef.current) {
      socketRef.current.emit("chat-message", messageInput, username);
      setMessageInput("");
    }
  }, [messageInput, username]);

  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages]);

  // ---
  // Initial Connection and UI State
  // ---

  const connectToMeet = useCallback(() => {
    if (username.trim() === "") {
      alert("Please enter a username.");
      return;
    }
    setAskForUsername(false);
    connectToSocketServer();
  }, [username, connectToSocketServer]);

  return (
    <div>
      {askForUsername ? (
        <div style={customStyles.lobbyContainer}>
          <h2>Enter Lobby</h2>
          <TextField
            id="username-input"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            inputProps={{ style: { color: "white" } }} // Text color
            InputLabelProps={{ style: { color: "white" } }} // Label color
            sx={{
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: "white" },
                "&:hover fieldset": { borderColor: "#007bff" },
                "&.Mui-focused fieldset": { borderColor: "#007bff" },
              },
              marginBottom: "20px",
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                connectToMeet();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={connectToMeet}
            style={{ marginLeft: "10px" }}
          >
            Connect
          </Button>
          <div style={customStyles.localVideoPreview}>
            <video
              ref={lobbyVideoRef}
              autoPlay
              muted
              playsInline
              style={customStyles.localVideoPreviewVideo}
            ></video>
          </div>
        </div>
      ) : (
        <div style={customStyles.meetVideoContainer}>
          {showChatModal && (
            <div style={customStyles.chatRoom}>
              <div style={customStyles.chatContainer}>
                <h1 style={{ color: "white" }}>Chat</h1>
                <div style={customStyles.chattingDisplay} ref={chatDisplayRef}>
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div
                        style={{ marginBottom: "15px" }}
                        key={item.timestamp || index}
                      >
                        <p
                          style={{
                            fontWeight: "bold",
                            margin: 0,
                            color: "#90CAF9",
                          }}
                        >
                          {item.sender}
                        </p>
                        <p style={{ margin: 0, color: "#e0e0e0" }}>
                          {item.data}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "#aaa" }}>No Messages Yet</p>
                  )}
                </div>
                <div style={customStyles.chattingArea}>
                  <TextField
                    value={messageInput}
                    onChange={handleMessageInput}
                    id="chat-input"
                    label="Enter Your chat"
                    variant="outlined"
                    fullWidth
                    inputProps={{ style: { color: "white" } }}
                    InputLabelProps={{ style: { color: "white" } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "white" },
                        "&:hover fieldset": { borderColor: "#007bff" },
                        "&.Mui-focused fieldset": { borderColor: "#007bff" },
                      },
                    }}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        sendMessage();
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={sendMessage}
                    style={{ marginLeft: "10px" }}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div style={customStyles.buttonControls}>
            <IconButton onClick={toggleVideo} style={{ color: "white" }}>
              {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton
              onClick={handleEndCall}
              style={{ color: "white", backgroundColor: "red" }}
            >
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={toggleAudio} style={{ color: "white" }}>
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </IconButton>

            {screenAvailable && (
              <IconButton
                onClick={toggleScreenShare}
                style={{ color: "white" }}
              >
                {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            )}

            <Badge badgeContent={newMessagesCount} max={999} color="error">
              <IconButton
                onClick={() => {
                  setShowChatModal(!showChatModal);
                  if (!showChatModal) setNewMessagesCount(0);
                }}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video
            style={customStyles.meetUserVideo}
            ref={meetingVideoRef}
            autoPlay
            muted
            playsInline
          ></video>

          <div style={customStyles.conferenceView}>
            {remoteVideos.map((video) => (
              <div key={video.socketId} style={customStyles.remoteVideoWrapper}>
                <video
                  data-socket={video.socketId}
                  ref={(ref) => {
                    if (ref && video.stream) {
                      ref.srcObject = video.stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  style={customStyles.remoteVideo}
                ></video>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
