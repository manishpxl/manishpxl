#!/usr/bin/env node
/**
 * Generates an animated "jet over contribution grid" SVG using a GitHub
 * user's real contribution calendar (last 34 weeks).
 *
 * Env vars:
 *   GH_USERNAME  - GitHub login (default: manishpxl)
 *   GH_TOKEN     - GitHub token (required)
 *   OUTPUT_PATH  - where to write the SVG (default: dist/github-jet.svg)
 */

import fs from "node:fs";
import path from "node:path";

const USERNAME = "manishpxl";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OUTPUT = process.env.OUTPUT_PATH || "dist/github-jet.svg";

const COLS = 34;
const ROWS = 7;
const CELL = 11;
const STEP = 14;
const GRID_X = 20;
const GRID_Y = 15;
const WIDTH = 513;
const HEIGHT = 170;
const JET_X_START = 35;
const JET_X_END = 478;
const LOOP_DUR = 20;
const MAX_TARGETS = 12;

const FLASH_COLOR = "#4CC9F0";
const BULLET_COLOR = "#7ee787";
const BLAST_COLOR = "#56d364";
const PAD_Y = 128;

if (!TOKEN) {
  console.error("Missing GH_TOKEN / GITHUB_TOKEN env var");
  process.exit(1);
}

const QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

async function fetchWeeks() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { login: USERNAME },
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

function buildCells(weeks) {
  const recent = weeks.slice(-COLS);
  const padCount = COLS - recent.length;

  const padded = Array.from({ length: padCount }, () => ({
    contributionDays: Array.from({ length: ROWS }, () => ({
      contributionCount: 0,
      color: "#0d1117",
      date: null,
    })),
  })).concat(recent);

  const cells = [];

  padded.forEach((week, col) => {
    week.contributionDays.forEach((day, row) => {
      cells.push({
        col,
        row,
        x: GRID_X + col * STEP,
        y: GRID_Y + row * STEP,
        color: day.color || "#0d1117",
        count: day.contributionCount || 0,
        date: day.date,
      });
    });
  });

  return cells;
}

function pickTargets(cells) {
  return [...cells]
    .filter((cell) => cell.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TARGETS)
    .sort((a, b) => a.col - b.col || a.row - b.row);
}

function keyTimeForCol(col, direction) {
  const span = 0.46;
  const time = 0.02 + (col / (COLS - 1)) * span;

  return direction === "forward" ? time : 1 - time;
}

function fmt(number) {
  return Number(number.toFixed(4));
}

function buildGrid(cells, targets) {
  const targetKey = new Set(targets.map((target) => `${target.col}-${target.row}`));
  let svg = "";

  for (const cell of cells) {
    const isTarget = targetKey.has(`${cell.col}-${cell.row}`);

    if (!isTarget) {
      svg += `<rect x="${cell.x.toFixed(2)}" y="${cell.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${cell.color}"/>\n`;
      continue;
    }

    const forwardTime = keyTimeForCol(cell.col, "forward");
    const backwardTime = keyTimeForCol(cell.col, "backward");
    const [firstTime, secondTime] = [
      Math.min(forwardTime, backwardTime),
      Math.max(forwardTime, backwardTime),
    ];

    const animationDuration = 0.006;

    svg += `<rect x="${cell.x.toFixed(2)}" y="${cell.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${cell.color}">`;
    svg += `<animate attributeName="fill" dur="${LOOP_DUR}s" repeatCount="indefinite" `;
    svg += `keyTimes="0;${fmt(firstTime)};${fmt(firstTime + animationDuration)};${fmt(secondTime)};${fmt(secondTime + animationDuration)};1" `;
    svg += `values="${cell.color};${cell.color};${FLASH_COLOR};${cell.color};${FLASH_COLOR};${cell.color}"/>`;
    svg += `</rect>\n`;
  }

  return svg;
}

function buildBulletsAndBlasts(targets) {
  let bullets = "";
  let blasts = "";
  const animationDuration = 0.006;

  for (const direction of ["forward", "backward"]) {
    const orderedTargets =
      direction === "forward" ? targets : [...targets].reverse();

    for (const cell of orderedTargets) {
      const time = keyTimeForCol(cell.col, direction);
      const riseTime = time - animationDuration * 3;
      const arriveTime = time;
      const fadeEndTime = time + animationDuration;

      const centerX = fmt(cell.x + CELL / 2);
      const targetY = fmt(cell.y + CELL / 2);

      bullets += `<circle cx="${centerX}" cy="${PAD_Y}" r="2.4" fill="${BULLET_COLOR}">`;
      bullets += `<animate attributeName="cy" dur="${LOOP_DUR}s" repeatCount="indefinite" `;
      bullets += `keyTimes="0;${fmt(riseTime)};${fmt(arriveTime)};1" `;
      bullets += `values="${PAD_Y};${PAD_Y};${targetY};${targetY}"/>`;
      bullets += `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" `;
      bullets += `keyTimes="0;${fmt(riseTime)};${fmt(arriveTime)};${fmt(fadeEndTime)};1" `;
      bullets += `values="0;1;1;0;0"/>`;
      bullets += `</circle>\n`;

      blasts += `<circle cx="${centerX}" cy="${targetY}" r="0" fill="none" stroke="${BLAST_COLOR}" stroke-width="1.6" opacity="0">`;
      blasts += `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" `;
      blasts += `keyTimes="0;${fmt(arriveTime)};${fmt(arriveTime + animationDuration * 3)};1" `;
      blasts += `values="0;1;9;9"/>`;
      blasts += `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" `;
      blasts += `keyTimes="0;${fmt(arriveTime)};${fmt(arriveTime + animationDuration * 3)};1" `;
      blasts += `values="0;1;1;0"/>`;
      blasts += `</circle>\n`;
    }
  }

  return { bullets, blasts };
}

function buildStars() {
  const points = [
    [8, 20, 1.2],
    [8, 60, 1.6],
    [8, 100, 2.0],
    [505, 25, 1.2],
    [505, 70, 1.6],
    [505, 110, 2.0],
    [30, 164, 1.2],
    [483, 164, 1.6],
  ];

  return points
    .map(
      ([x, y, duration]) =>
        `<circle cx="${x}" cy="${y}" r="1.1" fill="#8b949e"><animate attributeName="opacity" values="0.2;1;0.2" dur="${duration}s" repeatCount="indefinite"/></circle>`
    )
    .join("\n");
}

function buildJet() {
  return `<g id="jet">
  <g transform="translate(0,0)">
    <polygon points="0,-16 8,6 4,3 -4,3 -8,6" fill="#4CC9F0" stroke="#0ea5e9" stroke-width="1"/>
    <polygon points="-8,6 -14,12 -4,7" fill="#38bdf8"/>
    <polygon points="8,6 14,12 4,7" fill="#38bdf8"/>
    <circle cx="0" cy="-6" r="2.2" fill="#e0f2fe"/>
    <polygon points="-3,7 3,7 0,15" fill="#f0883e">
      <animate attributeName="opacity" values="0.5;1;0.6;1" dur="0.18s" repeatCount="indefinite"/>
    </polygon>
  </g>
  <animateTransform
    attributeName="transform"
    attributeType="XML"
    type="translate"
    dur="${LOOP_DUR}s"
    repeatCount="indefinite"
    keyTimes="0;0.5;1"
    values="${JET_X_START}.00,140.00;${JET_X_END}.00,140.00;${JET_X_START}.00,140.00"
  />
</g>`;
}

function buildSvg(weeks) {
  const cells = buildCells(weeks);
  const targets = pickTargets(cells);
  const { bullets, blasts } = buildBulletsAndBlasts(targets);

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Manish Kumar GitHub contribution jet heatmap">
<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="10" fill="#05070A"/>
${buildStars()}
<g id="grid">
${buildGrid(cells, targets)}</g>
<g id="bullets">
${bullets}</g>
<g id="blasts">
${blasts}</g>
${buildJet()}
</svg>`;
}

async function main() {
  console.log(`Fetching contributions for ${USERNAME}...`);

  const weeks = await fetchWeeks();
  const svg = buildSvg(weeks);

  const outputPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, "utf8");

  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});