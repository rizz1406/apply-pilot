// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "./App.jsx";

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

describe("application startup", () => {
  it("renders with a fresh browser", () => {
    render(<App />);
    expect(screen.getByText("Resume Tailor")).toBeTruthy();
  });

  it("repairs malformed saved profile fields without crashing", () => {
    localStorage.setItem("resumeTailor.profiles", JSON.stringify({ old: { name: { bad: true }, email: null, experience: ["bad"], _label: "Saved" } }));
    localStorage.setItem("resumeTailor.activeProfile", JSON.stringify("old"));
    render(<App />);
    expect(screen.getByText("Saved")).toBeTruthy();
  });
});
