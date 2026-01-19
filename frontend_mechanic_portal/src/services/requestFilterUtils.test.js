import { filterRequests } from "./requestFilterUtils";

describe("filterRequests", () => {
  const rows = [
    { id: "1", status: "open", issueDescription: "Battery dead", locationText: "Downtown" },
    { id: "2", status: "assigned", issueDescription: "Flat tire", locationText: "Northside" },
    { id: "3", status: "completed", issueDescription: "Engine overheating", locationText: "Downtown East" },
  ];

  test("text filters are case-insensitive contains", () => {
    const out = filterRequests(rows, { location: "DOWN", issue: "batt", status: "" });
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  test("filters are combinable (AND)", () => {
    const out = filterRequests(rows, { location: "downtown", issue: "engine", status: "" });
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  test("status filter matches canonical statuses", () => {
    const out = filterRequests(rows, { location: "", issue: "", status: "assigned" });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  test("empty filters return all rows", () => {
    const out = filterRequests(rows, { location: "", issue: "", status: "" });
    expect(out).toHaveLength(3);
  });
});
