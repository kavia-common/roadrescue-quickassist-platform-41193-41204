import { render, screen } from "@testing-library/react";
import App from "./App";
import { normalizeStatus } from "./services/statusUtils";

test("renders mechanic portal brand", () => {
  render(<App />);
  expect(screen.getByText(/RoadRescue/i)).toBeInTheDocument();
});

test("normalizeStatus returns only DB-allowed request statuses", () => {
  const allowed = new Set(["open", "assigned", "completed", "canceled"]);

  // Direct allowed values
  for (const s of allowed) {
    expect(normalizeStatus(s)).toBe(s);
  }

  // Legacy / previous canonical tokens must map into allowed set
  expect(normalizeStatus("OPEN")).toBe("open");
  expect(normalizeStatus("Submitted")).toBe("open");
  expect(normalizeStatus("ASSIGNED")).toBe("assigned");
  expect(normalizeStatus("ACCEPTED")).toBe("assigned");

  // Unsupported intermediate states must not leak into DB writes
  expect(normalizeStatus("EN_ROUTE")).toBe("assigned");
  expect(normalizeStatus("WORKING")).toBe("assigned");
  expect(normalizeStatus("In Progress")).toBe("assigned");

  expect(normalizeStatus("COMPLETED")).toBe("completed");
  expect(normalizeStatus("CANCELLED")).toBe("canceled");

  // Safety: never return an unpermitted token
  const candidates = ["EN_ROUTE", "WORKING", "foo", "", null, undefined];
  for (const c of candidates) {
    expect(allowed.has(normalizeStatus(c))).toBe(true);
  }
});
