import React from "react";
import "../App.css";
import { Link, useNavigate } from "react-router-dom";


export default function LandingPage() {
  const router = useNavigate();

  return (
    <div className="landingPageContainer">
      <nav>
        <div className="navHeader">
          <h2>Apna Video Call</h2>
        </div>
        <div className="navlist">
          <p
            onClick={() => {
              router("/guest");
            }}
          >
            Join as Guest
          </p>
          <p
            onClick={() => {
              router("/auth");
            }}
          >
            Register
          </p>
          <div
            onClick={() => {
              router("/auth");
            }}
            role="button"
          >
            <p>Login</p>
          </div>
        </div>
      </nav>

      <div className="landingMainContainer">
         <div id="img">
          <img src="/mobile.png" alt="" />
        </div>
        <div>
          <h1>
            <span style={{ color: "#FF9839" }}>Connect</span> with your loved
            Ones
          </h1>

          <p style={{display:"none"}}>Cover a distance by Apna Video Call</p>
          <div id="button" style={{}}>
            <Link to={"/auth"}>Get Started</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
