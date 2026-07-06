import React, { useContext } from "react";
import Wizard from "./views/wizard";
import { ThemeContext } from "./context/ThemeContext";

export default function App() {
  const { theme } = useContext(ThemeContext);

  return (
    <div className={`app-container ${theme}`}>
      <Wizard />
    </div>
  );
}