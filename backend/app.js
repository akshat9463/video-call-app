import { createServer } from "node:http";
import express from 'express';
import mongoose from "mongoose";
import cors from  "cors";
import {connectToSocket} from "./controllers/socketConnection.js";
import userRoutes from './routes/userRoute.js';

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set('port', (process.env.PORT || 8080));
app.use(cors());
app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));
app.use("/api/v1/users",userRoutes);

const start = async ()=>{
    const connection = await mongoose.connect("mongodb+srv://akshatkanaujiya1:CfvEnAHnXVhxN9El@cluster0.wr2ecxy.mongodb.net/zoom?retryWrites=true&w=majority&appName=Cluster0")
    console.log(`MONGO connected DB.`);
    server.listen(8080,()=>{
        console.log(`app is listening at port 8080`);
    });
}

start();