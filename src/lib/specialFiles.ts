export const DEFAULT_CANVAS = `${JSON.stringify(
  {
    nodes: [
      {
        id: "welcome-card",
        type: "text",
        text: "# New canvas\n\nDouble-click to edit this card.",
        x: -180,
        y: -90,
        width: 360,
        height: 180,
        color: "4",
      },
    ],
    edges: [],
  },
  null,
  2,
)}\n`;

export const DEFAULT_BASE = `filters:
  and: []
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.folder
      - file.mtime
`;
