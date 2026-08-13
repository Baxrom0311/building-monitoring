#!/usr/bin/env python3
"""
generate_articles.py — builds two IMRAD-format academic papers (LaTeX -> PDF)
describing the Meter Monitor multi-utility IoT platform.

Usage:
    docs/.venv/bin/python docs/generate_articles.py

Each paper is assembled from clearly separated Python string variables (one
per IMRAD section), so future edits happen here — in prose, in Python — and
a re-run regenerates both the .tex source and the compiled .pdf. Compilation
shells out to a local `pdflatex` (run twice, so cross-references/section
numbers settle) — no internet, no LaTeX web service, fully local and
reproducible.

Requires: a local TeX distribution providing pdflatex, mathpazo, microtype,
amsmath, booktabs, hyperref, geometry (all standard in any MacTeX / TeX Live
"basic" scheme). Python deps: none beyond the standard library.
"""

import subprocess
import sys
from pathlib import Path

DOCS_DIR = Path(__file__).parent
BUILD_DIR = DOCS_DIR / "build"

sys.path.insert(0, str(DOCS_DIR))
import generate_figures  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# Shared preamble / styling — one consistent "house style" for both papers.
# Palatino-like text+math (mathpazo) reads as a classic, professional journal
# face; microtype tightens spacing; titlesec gives clean sans-serif-ish
# section headings without needing a third-party class file.
# ─────────────────────────────────────────────────────────────────────────────

PREAMBLE = r"""
\documentclass[11pt,a4paper]{article}

\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{times}
\renewcommand{\ttdefault}{cmtt}
\usepackage[scaled=0.92]{helvet}
\usepackage{microtype}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{booktabs}
\usepackage{array}
\usepackage{caption}
\usepackage{xcolor}
\usepackage{titlesec}
\usepackage{fancyhdr}
\usepackage[hidelinks,colorlinks=true,linkcolor=black,citecolor=black,urlcolor=NavyBlue]{hyperref}
\usepackage{enumerate}
\usepackage{setspace}
\usepackage{graphicx}
\graphicspath{{../figures/}}
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning,fit,backgrounds,shapes.geometric}

\definecolor{NavyBlue}{RGB}{0,60,120}
\definecolor{RuleGray}{RGB}{140,140,140}

% ── Categorical palette (validated — see docs/generate_figures.py) ──
\definecolor{PalBlue}{HTML}{2a78d6}
\definecolor{PalGreen}{HTML}{008300}
\definecolor{PalMagenta}{HTML}{e87ba4}
\definecolor{PalYellow}{HTML}{eda100}
\definecolor{PalAqua}{HTML}{1baf7a}
\definecolor{PalRed}{HTML}{e34948}
\definecolor{PalMuted}{HTML}{52514e}
\definecolor{PalSurface}{HTML}{fcfcfb}

% ── Section styling: small caps, rule under section, sans-ish subsections ──
\titleformat{\section}
  {\normalfont\Large\bfseries\scshape}
  {\thesection}{1em}{}
  [{\color{RuleGray}\titlerule}]
\titleformat{\subsection}
  {\normalfont\large\bfseries}
  {\thesubsection}{1em}{}
\titlespacing*{\section}{0pt}{1.4em}{0.8em}
\titlespacing*{\subsection}{0pt}{1.1em}{0.5em}

% ── Header/footer ──
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small\itshape \papershorttitle}
\fancyhead[R]{\small\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{RuleGray}\leaders\hrule height \headrulewidth\hfill}}
\setlength{\headheight}{22pt}

\setstretch{1.06}

% ── Abstract box styling ──
\renewenvironment{abstract}{%
  \begin{center}\bfseries\large Abstract\end{center}%
  \begin{quote}\small\itshape
}{%
  \end{quote}
}

\newcommand{\code}[1]{\texttt{\small #1}}
"""


AUTHOR_NAME = "Baxrom R. Reyimberganov"
AUTHOR_AFFIL = r"Department of Software Engineering, Urgench State University, Urgench, 220100, Uzbekistan"
AUTHOR_EMAIL = "bahromreyimberganov0311@gmail.com"
AUTHOR_ORCID = "0009-0005-8124-0042"


def title_block(title: str, subtitle: str, keywords: str) -> str:
    return rf"""
\newcommand{{\papershorttitle}}{{{subtitle}}}

\title{{\bfseries {title}}}
\author{{{AUTHOR_NAME}$^{{1,*}}$}}
\date{{}}

\begin{{document}}
\maketitle
\thispagestyle{{empty}}
\vspace{{-1.6em}}

\begin{{center}}
\small $^{{1}}${AUTHOR_AFFIL}

\smallskip
\small $^{{*}}$Corresponding author: {AUTHOR_NAME}, Email: \href{{mailto:{AUTHOR_EMAIL}}}{{{AUTHOR_EMAIL}}}, ORCID: \href{{https://orcid.org/{AUTHOR_ORCID}}}{{{AUTHOR_ORCID}}}
\end{{center}}
\vspace{{0.6em}}

\begin{{center}}
\small\textit{{Keywords: {keywords}}}
\end{{center}}
\vspace{{1em}}
"""


# ─────────────────────────────────────────────────────────────────────────────
# ARTICLE 1 — System architecture paper
# ─────────────────────────────────────────────────────────────────────────────

A1_TITLE = "A Layered Architecture for Multi-Utility IoT Monitoring: Design and Implementation of a Building-Scale Metering Platform"
A1_SHORT = "A Layered Architecture for Multi-Utility IoT Monitoring"
A1_KEYWORDS = "IoT architecture, utility metering, DLMS/COSEM, RS-485, edge-to-cloud systems, FastAPI"

A1_ABSTRACT = r"""
Utility monitoring in multi-apartment residential buildings --- electricity,
water, gas, soil moisture, ambient sound, and heating-loop temperature ---
is typically implemented as a collection of disjoint, single-purpose
systems. This paper describes the design and implementation of a unified
platform that ingests heterogeneous utility readings from ESP32-based
sensor nodes into a single backend and presents them through a common
dashboard. The platform combines a building-local RS-485 sensor bus with a
per-building WiFi bridge, an asynchronous FastAPI/PostgreSQL backend, and a
React single-page application. We describe the system's layered
architecture, its device-authentication and data model, the rationale
behind consolidating an earlier LoRa-mesh design into a simpler wired bus,
and the operational infrastructure that serves it in production. We report
concrete implementation metrics and discuss known architectural
limitations, including a 32-bit timestamp representation that will require
remediation before the year 2038.
"""

A1_INTRO = r"""
Multi-utility monitoring --- observing electricity, water, gas, and
environmental parameters across many physical points in a building or
estate --- is a recurring requirement in property management, and one that
is poorly served by consumer smart-home products, which are typically
single-utility and cloud-locked to a vendor. Purpose-built commercial
metering platforms exist, but are often costly per endpoint and closed to
customization, which matters when the building housing stock includes
legacy analog meters (pressure switches, mechanical-interface electricity
meters) that must be retrofitted rather than replaced.

This paper describes a platform built to address that gap for a specific,
concrete deployment context: multi-apartment buildings where (a) each
building already has a primary electricity meter compliant with the
DLMS/COSEM standard (meter families TE71/TE73) reachable over RS-485,
(b) supplementary sensors (water pressure, gas pressure, soil moisture,
sound level, heating-loop temperature) are distributed at various points
within the same building, and (c) only one reliable WiFi/internet uplink is
assumed \emph{per building}, not per sensor.

The central architectural question this constraint raises is: how should
$N$ heterogeneous, physically distributed sensors within one building reach
a cloud backend if only one of them --- or one dedicated node --- has
network connectivity? We describe an evolution from an earlier design (a
LoRa mesh network requiring a dedicated radio gateway per cluster) to a
simpler wired-bus topology, and justify that evolution in terms of both
engineering cost and operational reliability.

We contribute: (1) a description of a three-tier IoT-to-cloud architecture
(RS-485 sensor bus $\rightarrow$ WiFi bridge $\rightarrow$ HTTP/WebSocket
backend) suited to single-building, single-uplink deployments; (2) a
device/data model that accommodates a passive-forwarding pattern, where a
single network-visible ``device'' (the bridge) transparently carries
readings from multiple physically distinct sensors while preserving
per-sensor identity for traceability; (3) a report of the platform's
current implementation scale and a discussion of the architectural debts
accepted along the way.
"""

A1_METHODS = r"""
\subsection{Overall topology}

The platform is organized in four tiers:

\begin{enumerate}
\item \textbf{Sensor layer} --- individual ESP32 microcontrollers
  (``leaf'' nodes), each running a single-purpose firmware image for one
  utility type. A leaf node has no network stack of its own; it
  communicates exclusively over a two-wire RS-485 differential bus (A/B)
  shared by all leaves in the same building.
\item \textbf{Bridge layer} --- one ESP32 per building, running a firmware
  image that (a) polls the RS-485 bus as bus master, collecting readings
  from every registered leaf, and (b) holds the building's only WiFi/HTTP
  uplink, relaying every collected reading to the backend over HTTPS.
\item \textbf{Backend layer} --- a single, multi-tenant FastAPI service
  backed by PostgreSQL, exposing a REST API for device ingestion and a
  WebSocket channel for live dashboard updates.
\item \textbf{Presentation layer} --- a React single-page application
  serving building operators, and, separately, a simplified kiosk-style
  ``public display'' endpoint for building-lobby screens.
\end{enumerate}

A fifth, offline component --- a PyQt6 desktop application --- supports
field technicians performing direct RS-485/DLMS diagnostics against a
meter and flashing firmware onto new nodes, independent of the production
network.

\begin{figure}[h]
\centering
\resizebox{\textwidth}{!}{%
\begin{tikzpicture}[
  box/.style={draw, rounded corners=2pt, minimum height=1.05cm, align=center,
    font=\small, line width=1pt, fill=white, inner sep=6pt},
  arr/.style={-{Latex[length=2.6mm]}, line width=0.9pt, draw=PalMuted},
  lbl/.style={font=\scriptsize, text=PalMuted, align=center}
]
  \node[box, draw=PalBlue, minimum width=2.6cm] (leaves)
    {Leaf nodes\\[1pt]\scriptsize water\,/\,gas\,/\,soil\\\scriptsize sound\,/\,heating};
  \node[box, draw=PalGreen, minimum width=2.4cm, right=1.9cm of leaves] (bridge)
    {Bridge\\[1pt]\scriptsize (+ own DLMS meter)};
  \node[box, draw=PalYellow, minimum width=2.8cm, right=1.9cm of bridge] (backend)
    {FastAPI backend\\[1pt]\scriptsize PostgreSQL};
  \node[box, draw=PalAqua, minimum width=2.4cm, right=1.9cm of backend] (frontend)
    {React SPA\\[1pt]\scriptsize dashboard};

  \draw[arr] (leaves) -- node[lbl, above]{RS-485\\(A/B bus)} (bridge);
  \draw[arr] (bridge) -- node[lbl, above]{HTTPS} (backend);
  \draw[arr] (backend) -- node[lbl, above]{REST +\\WebSocket} (frontend);

  \node[box, draw=PalMagenta, minimum width=3.1cm, below=1.5cm of bridge, xshift=0.3cm] (desktop)
    {Desktop app (PyQt6)\\[1pt]\scriptsize field diagnostics \& flashing};
  \draw[arr, dashed] (desktop) -- node[lbl, right, xshift=1mm]{RS-485/USB\\(offline)} (bridge);
\end{tikzpicture}}
\caption{Four-tier architecture: RS-485 sensor leaves report to a
per-building bridge, which relays over HTTPS to the backend; the frontend
consumes the backend's REST/WebSocket API. A separate offline desktop tool
(dashed edge) supports field diagnostics and firmware flashing, independent
of the production data path.}
\label{fig:architecture}
\end{figure}

\subsection{RS-485 bus protocol}

Communication on the building-internal bus follows a master--poll pattern
to avoid collisions on the shared differential pair: the bridge
periodically broadcasts a \code{DISCOVER} command; every leaf not already
registered in the bridge's roster responds, with a randomized jitter
window to reduce the probability of two leaves replying simultaneously.
Once registered, a leaf is addressed individually via a
\code{POLL <id>} command and is expected to respond with a
length-prefixed JSON payload describing its most recent reading.

Discovery is not a one-time boot-time event: the bridge re-runs
\code{DISCOVER} on every polling cycle for the lifetime of the deployment,
so a leaf that is slow to power up, or that is physically added to an
already-running bus, is absorbed into the roster within one polling cycle
rather than requiring a bridge restart. A leaf that has been addressed
recently suppresses its own \code{DISCOVER} response for a bounded window
$T_{\text{skip}}$, which prevents an already-registered, healthy leaf from
re-announcing itself and colliding with a genuinely new leaf's discovery
attempt.

For a roster of $n$ leaves, each polled with a per-leaf reply window
$T_{\text{reply}}$ and up to $r$ retries on non-response, the worst-case
duration of one full polling cycle (all leaves unresponsive) is bounded by

\begin{equation}
T_{\text{cycle}}^{\max} \;=\; T_{\text{discover}}
  \;+\; n \left( r \, T_{\text{reply}} + T_{\text{gap}} \right)
\label{eq:cycle-bound}
\end{equation}

\noindent where $T_{\text{discover}}$ is the (bounded) discovery-round
duration and $T_{\text{gap}}$ is a fixed inter-leaf settling delay. This
bound is what determines whether a bus-wide fault (e.g., a wiring break
taking down every leaf simultaneously) can be tolerated without starving
other periodic tasks --- WiFi maintenance, watchdog service --- that must
also run within the same control loop; \S~4 of the companion reliability
paper discusses a concrete case where an unbudgeted $T_{\text{cycle}}^{\max}$
was found to approach several seconds and required tightening.

\subsection{Electricity metering via DLMS/COSEM}

Leaves (and the bridge itself, where directly wired) responsible for
electricity readings communicate with the physical meter using the
DLMS/COSEM application layer over HDLC framing, on a second RS-485 channel
kept electrically and temporally separate from the building-internal
sensor bus. The connection sequence attempts, in order: (1) an
authenticated association at 9600 baud using the meter's ``Client 1''
logical device with HLS5 GMAC authentication; (2) on failure, a retry at
4800 baud; (3) on further failure, an unauthenticated association against
``Client 16'' (public/limited object set); (4) in an explicit test/demo
mode, a simulated reading. Standard OBIS object codes are used to read
voltage, current, active power, frequency, energy accumulation, and power
factor per phase.

\subsection{Data model and the ``bridge-as-device'' pattern}

The backend's device/reading model was deliberately kept simple: a
\code{Device} row represents anything with its own network identity ---
in practice, every bridge, and every leaf when standalone-WiFi firmware
is used instead of RS-485-leaf firmware. A \code{Reading} row represents
one timestamped measurement and carries a \code{utility\_type}
discriminator over a wide, mostly-sparse column set, rather than one
normalized table per utility type --- a pragmatic trade-off that keeps
ingestion and query code uniform across utility types at the cost of many
\texttt{NULL} columns per row.

The bridge/leaf topology required one addition: when the bridge forwards a
leaf's reading, it does so \emph{under its own device identity} (so the
backend, and the operator dashboard, see one network-visible device per
building rather than one per sensor) while attaching the leaf's own
hardware identifier as a separate \code{source\_id} field, preserving
per-sensor traceability without multiplying the number of first-class
``devices'' an operator must manage. A subsequent schema revision
introduced a dedicated \code{Sensor} entity with a
\code{(sensor\_uid, utility\_type)} uniqueness constraint and a nullable
foreign key from \code{Reading}, to formalize this many-sensors-per-device
relationship independently of the wide-table \code{Reading} design.

\begin{figure}[h]
\centering
\begin{tikzpicture}[
  ent/.style={draw, rounded corners=2pt, line width=1pt, fill=white,
    align=left, font=\scriptsize, inner sep=7pt},
  fk/.style={-{Latex[length=2.4mm]}, line width=0.8pt},
  lbl/.style={font=\scriptsize, text=PalMuted, align=center}
]
  \node[ent, draw=PalBlue] (device) at (0,0)
    {{\bfseries\small Device}\\[2pt] id (PK)\\ utility\_type\\ token};
  \node[ent, draw=PalYellow, right=3.6cm of device] (reading)
    {{\bfseries\small Reading}\\[2pt] device\_id (FK)\\ source\_id\\ sensor\_id (FK, null)\\ utility\_type, value(s)};
  \node[ent, draw=PalAqua, below=1.5cm of reading] (sensor)
    {{\bfseries\small Sensor}\\[2pt] id (PK)\\ sensor\_uid\\ transport\_device\_id (FK)\\ utility\_type};

  \draw[fk, draw=PalMuted] (reading.west) -- node[lbl, above]{device\_id} (device.east);
  \draw[fk, draw=PalMuted] (sensor.north) -- node[lbl, right]{sensor\_id} (reading.south);
  \draw[fk, draw=PalMuted, dashed] (sensor.west) .. controls +(-1.4,0) and +(0,-1.4) ..
    node[lbl, below, pos=0.55]{transport\_device\_id} (device.south);
\end{tikzpicture}
\caption{The bridge-as-device forwarding pattern: a bridge's own network
identity is the \code{Device} row every \code{Reading} it forwards is
attributed to (\code{device\_id}); the leaf's own hardware identity is
preserved separately as \code{source\_id}. The later-introduced
\code{Sensor} entity (dashed edge) formalizes the same many-sensors-per-
bridge relationship as a nullable foreign key, additive to the original
wide-table design.}
\label{fig:datamodel}
\end{figure}

\subsection{Security model}

Two independent authentication mechanisms operate at different trust
boundaries. User-facing endpoints are protected by JWT bearer tokens with
role-based access (\code{admin}/\code{user}/\code{viewer}); device-facing
ingestion endpoints are protected by a per-device \code{X-Device-Token}
header. An AI-assisted chat feature exposed to operators is deliberately
prevented from issuing arbitrary database queries: it is restricted to a
fixed, server-defined set of callable tools, with every privileged tool
invocation independently re-checking the caller's role server-side rather
than trusting the model's own judgment.

Several capabilities present in an earlier iteration were deliberately
\emph{removed} rather than merely deprecated: remote relay control (the
ability to disconnect a meter over the network) was removed end-to-end
following a decision that the capability's risk profile was not justified
by its operational value; an earlier LoRa-mesh firmware generation's
payload encryption was removed rather than retained, since its key was
committed in the firmware source repository and therefore provided no
real confidentiality guarantee.

\subsection{Deployment and operational infrastructure}

The backend runs as a single systemd-managed process on one modestly
sized VPS instance, fronted by nginx, which also serves the frontend's
static build and terminates TLS. Continuous integration is organized as
three independent pipelines --- backend, frontend, and firmware --- each
triggered only on changes within its own subtree; the backend and
frontend pipelines additionally perform an automatic deploy-on-merge
following a successful test/build run, while the firmware pipeline is
compile-verification only. Over-the-air firmware updates are deliberately
not implemented; updates are applied by direct USB flashing, a decision
made after an earlier over-the-air mechanism was judged to add more
operational risk than it removed.
"""

A1_RESULTS = r"""
Table~\ref{tab:scale} summarizes the implementation's scale at the time of
writing.

\begin{table}[h]
\centering
\small
\begin{tabular}{@{}p{2.0cm} p{4.3cm} p{6.2cm}@{}}
\toprule
\textbf{Component} & \textbf{Technology} & \textbf{Approx. size} \\
\midrule
Backend  & Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL, Alembic
         & $\sim$15{,}000 lines; 30 migrations; 15 routers \\
Frontend & React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS
         & $\sim$87 source files \\
Firmware & C++17, PlatformIO / Arduino-ESP32
         & $\sim$4{,}900 lines; 32 build configurations across 6 utility
           types and 3 deployment roles (standalone-WiFi, RS-485-leaf,
           bridge) \\
History  & --- & 347 commits at time of writing \\
\bottomrule
\end{tabular}
\caption{Implementation scale across the three primary codebases.}
\label{tab:scale}
\end{table}

The consolidation from a LoRa-mesh architecture to the RS-485 bus/bridge
architecture eliminated an entire class of hardware (dedicated radio
gateway nodes) and an entire protocol layer (mesh routing, packet
relay/flood, per-hop TTL handling) from the production deployment path;
the LoRa firmware and its companion legacy frontend were archived to a
separate branch rather than deleted outright, preserving the option to
revisit the approach for a future deployment context without carrying
that complexity in the actively maintained codebase.

The device/reading data model successfully accommodated the
bridge-as-device forwarding pattern without requiring a schema change at
the point the RS-485 architecture was introduced, validating the decision
to keep \code{Reading} a wide, utility-type-discriminated table; the
subsequent introduction of a first-class \code{Sensor} entity was additive
(a nullable foreign key) rather than a breaking change, allowing the
migration to proceed with an online, batched backfill against a live
production table.
"""

A1_DISCUSSION = r"""
\textbf{Known architectural debt.} All timestamp columns in the schema
are stored as 32-bit \code{Integer} rather than a wider type --- a
decision inherited from an earlier development phase using SQLite (where
the practical distinction is invisible) that only became a visible
constraint after migrating to PostgreSQL, which enforces fixed-width
integer storage. This is the classic Y2038 problem: every such column
will overflow when
\[
  t_{\text{unix}} \;\geq\; 2^{31} - 1 \;=\; 2{,}147{,}483{,}647
  \quad\text{seconds after the epoch,}
\]
i.e., 03:14:07 UTC on 19 January 2038. The remediation --- migrating to a
64-bit \code{BigInteger} representation across every timestamp column and
every downstream consumer --- is understood and deferred rather than
unknown, but remains unresolved at the time of writing. We note this
explicitly as a case study in how a storage-engine change can silently
promote a previously invisible design limitation into an enforced one.

\textbf{Consolidation debt.} The migration from two parallel frontend
codebases to a single actively maintained frontend, and from two firmware
generations (LoRa-mesh and RS-485-bus) to one, both remain partially
visible in the operational surface: a subset of pages exist in only one
of the two frontend generations, a residual asymmetry from the migration
proceeding page-by-page rather than atomically. We consider this an
acceptable, explicitly tracked debt rather than an oversight, but flag it
as a concrete example of the cost of incremental versus atomic
architecture migrations in a system under continuous feature development.

\textbf{Security posture.} We note, as a limitation acknowledged but not
yet remediated at the time of writing, that firmware images built in
debug/development configurations bundle a single shared bootstrap
device-authentication token and disable TLS certificate validation; this
is an accepted trade-off for field-debugging convenience during the
current deployment phase, but represents a fleet-wide impersonation risk
if a debug-configuration binary or its source were to leak, and is
recorded here as explicit unresolved work.

\textbf{Threats to generalizability.} The architecture described here is
well suited to its specific deployment assumption --- one reliable WiFi
uplink per building, with all sensors physically reachable by a low-cost
twisted-pair bus from a single bridge point. It is a poor fit for
deployments spanning distances or obstacles the RS-485 bus cannot
practically cross, where the mesh-radio approach this system moved away
from --- or a hybrid retaining both approaches for different deployment
contexts --- would be the more appropriate choice; we regard the two as
complementary rather than the wired-bus approach being a strict
improvement in the general case.
"""

# ─────────────────────────────────────────────────────────────────────────────
# ARTICLE 2 — Reliability engineering case study
# ─────────────────────────────────────────────────────────────────────────────

A2_TITLE = "Reliability Engineering for Field-Deployed ESP32 Sensor Nodes: A Case Study in Fault Detection, Recovery, and Bounded Latency"
A2_SHORT = "Reliability Engineering for Field-Deployed ESP32 Sensor Nodes"
A2_KEYWORDS = "embedded systems reliability, watchdog timers, fault detection, sensor calibration, ESP32, fail-safe design"

A2_ABSTRACT = r"""
Field-deployed embedded sensor nodes fail silently far more often than
they fail loudly: a disconnected probe, a momentarily unresponsive I2C
peripheral, or a Wi-Fi access point that is slower to boot than the node
itself do not, by default, produce an error --- they produce a plausible
but wrong number, or a frozen display indistinguishable from a live one.
This paper reports a systematic reliability audit of an ESP32-based
multi-sensor firmware fleet (32 build configurations across six utility
types) and the fixes applied. We document sixteen distinct defects spanning
four categories --- unbounded blocking with no watchdog protection, sensor
fault masking, unbounded memory allocation, and boot-time race conditions
--- present the calibration and validity-check formulas used to distinguish
a genuine reading from a rail-pinned sensor, and report a compile-matrix
verification methodology (fifteen build configurations, full recompilation
after every change) used as a regression gate throughout. We conclude with
a case where a proposed fix (a receive-side checksum for a serial
metering protocol) was deliberately reverted after code review because it
could not be validated against physical hardware, illustrating a
conservative-by-default policy for firmware that has not yet been field
tested.
"""

A2_INTRO = r"""
An embedded sensor node that is unreachable produces an obvious signal:
its absence. An embedded sensor node that is \emph{malfunctioning while
appearing to work} is far more dangerous operationally, because nothing
in the system --- neither the node itself, nor the backend it reports to,
nor the human glancing at a wall-mounted display --- has any reason to
distrust the number it is looking at. This failure mode is the central
concern of this paper: not ``does the device crash,'' but ``when the
device or the physical world around it degrades, does the system notice?''

We report on a systematic reliability audit of the firmware fleet
underlying the platform described in a companion architecture paper
(``A Layered Architecture for Multi-Utility IoT Monitoring''): 32 distinct
PlatformIO build configurations, covering
six utility types (electricity, water, gas, soil moisture, sound,
heating) across three deployment roles (standalone WiFi node, RS-485 bus
leaf, RS-485 bridge/collector). The audit proceeded in four passes of
increasing depth --- code-level sensor logic, RS-485 bus/bridge timing,
ESP32 platform-level stability primitives (watchdog, brownout, heap), and
finally the failure modes introduced by the fixes from the earlier passes
themselves --- and is, to our knowledge, a reasonably complete account of
the defect classes one should expect to find in a field firmware fleet
that grew organically over multiple sensor types without a single
reliability review pass.

Our contributions are: (1) a taxonomy of four defect classes recurring
across otherwise-unrelated sensor drivers and subsystems; (2) the specific
validity-check formulas used to convert a raw ADC or protocol reading into
a \emph{trustworthy-or-flagged} value, derived from each sensor's own
calibration; (3) a report of a compile-matrix regression methodology used
to keep sixteen sequential fixes from silently breaking any of the
fleet's 32 build targets; and (4) an explicit account of a fix that was
implemented, verified to compile, and then \emph{deliberately reverted}
after reasoning about the asymmetry between its potential benefit and its
unverified risk --- offered as a worked example of when ``it compiles and
looks correct'' is not sufficient justification to ship embedded code
that has not been exercised against real hardware.
"""

A2_METHODS = r"""
\subsection{Audit methodology}

Each pass targeted a different layer of the system and used the same
discipline: read the full source of the file(s) under review (not a
diff), trace every code path including error branches, and --- for any
candidate fix --- recompile the full affected subset of the 32 build
configurations via PlatformIO before considering the fix complete.
Table~\ref{tab:passes} summarizes the four passes.

\begin{table}[h]
\centering
\small
\begin{tabular}{@{}l p{9.3cm}@{}}
\toprule
\textbf{Pass} & \textbf{Scope} \\
\midrule
1 & Per-sensor read/calibration logic (soil, sound, water, gas, heating,
    electricity/DLMS) \\
2 & RS-485 bus framing, bridge polling cycle, leaf response handling \\
3 & ESP32 platform primitives: task watchdog registration, brownout
    detector interaction, heap allocation patterns, boot-time WiFi
    state machine \\
4 & Failure modes introduced \emph{by} the fixes from passes 1--3
    (e.g., a new retry loop's own worst-case resource use) \\
\bottomrule
\end{tabular}
\caption{The four audit passes and their scope.}
\label{tab:passes}
\end{table}

Pass 4 is methodologically the most interesting: it treats every
previous fix as a new piece of untrusted code subject to the same
scrutiny as the code it replaced, rather than assuming a fix is correct
because it addresses the defect it was written for. Two of the defects
reported in \S~3 (a heap-fragmentation risk in a WiFi retry loop, and an
unbounded memory read in an HTTP response handler) were found during
pass 4, in code written during passes 2--3 of the same audit.

\subsection{Fault taxonomy}

We group the sixteen defects found into four classes.

\paragraph{Class A --- unbounded blocking without watchdog protection.}
A code path that can block for an unbounded or very long duration, in a
build configuration where the ESP32 task watchdog timer (TWDT) was never
registered for that task. Seven of the fleet's 32 build configurations
--- primarily bring-up/diagnostic firmware images, but including at least
one passively field-deployed display mode --- fell into this class: any
hang in those paths required a manual power cycle to recover from, with
no automatic reset.

\paragraph{Class B --- sensor fault masking.}
A sensor read path that, on a disconnected probe, a shorted input, or an
otherwise-invalid physical signal, returns a numerically plausible value
with a ``valid'' flag set, rather than flagging the reading as faulty.
This is the most operationally dangerous class, because the failure is
invisible at every downstream layer: the device reports it, the backend
stores it, and the dashboard renders it as if it were real.

\paragraph{Class C --- unbounded memory allocation.}
A code path whose memory allocation size is a function of untrusted
input (a network response, a sensor burst) with no upper bound enforced
\emph{before} the allocation occurs, as distinct from an upper bound
enforced only after the fact.

\paragraph{Class D --- boot-time race conditions.}
A one-shot readiness check performed once at boot, whose negative result
is treated as permanent for the remainder of the run, even though the
underlying condition (a peripheral's power rail settling, a WiFi access
point finishing its own boot after a shared power event) is transient
and would resolve within seconds if only the check were retried.

\subsection{Validity-check formulas}

Three sensor drivers required a closed-form validity check derived from
their own calibration, rather than a generic range clamp.

\paragraph{Capacitive soil moisture.} The raw analog-to-digital reading
$r$ is converted to a percentage via a two-point calibration
$\left(r_{\text{dry}}, r_{\text{wet}}\right)$, measured in air and in
water respectively:

\begin{equation}
  \hat{p} \;=\; \frac{r_{\text{dry}} - r}{r_{\text{dry}} - r_{\text{wet}}}
  \times 100, \qquad
  p \;=\; \mathrm{clamp}\!\left(\hat{p},\, 0,\, 100\right).
\label{eq:soil}
\end{equation}

Two failure modes are latent in Eq.~\eqref{eq:soil} alone. First, if
$r_{\text{dry}} = r_{\text{wet}}$ (a calibration error), the expression
is $0/0$, and IEEE~754 division produces \texttt{NaN}; because
\code{clamp} in the runtime's standard library is comparison-based and
every comparison against \texttt{NaN} is false, \texttt{NaN} passes
through \emph{unclamped} and can reach a downstream JSON serializer as a
syntactically invalid token. Second, and more consequentially: a
disconnected or shorted probe does not fail to produce a reading --- it
produces $r$ pinned at or near one ADC rail (0 or the converter's full
scale), and Eq.~\eqref{eq:soil} maps that directly to a perfectly
plausible $p$ near 0\% or 100\%, indistinguishable from a genuinely dry
or saturated substrate. We therefore add an explicit fault predicate,
independent of the percentage computation:

\begin{equation}
  \text{fault}(r) \;=\;
  \begin{cases}
    \text{true} & r \le \min(r_{\text{dry}}, r_{\text{wet}}) - m \\
    \text{true} & r \ge \max(r_{\text{dry}}, r_{\text{wet}}) + m \\
    \text{false} & \text{otherwise,}
  \end{cases}
\label{eq:soil-fault}
\end{equation}

\noindent with margin $m = \max\!\left(0.1\,\lvert r_{\text{dry}} -
r_{\text{wet}}\rvert,\; m_{\min}\right)$ for a small absolute floor
$m_{\min}$ --- a correctly wired sensor should never read materially
beyond its own two calibration endpoints, so exceeding them by more than
measurement noise is a stronger disconnect signal than a merely extreme,
still-in-range percentage.

\begin{figure}[h]
\centering
\includegraphics[width=0.82\textwidth]{soil_calibration.pdf}
\caption{Eq.~\eqref{eq:soil} (solid line) and the fault predicate of
Eq.~\eqref{eq:soil-fault} (shaded bands) for
$r_{\text{dry}}=3300$, $r_{\text{wet}}=1400$. A rail-pinned reading in
either shaded region is flagged as a sensor fault rather than reported as
an extreme-but-plausible percentage.}
\label{fig:soil-calibration}
\end{figure}

\paragraph{Current-loop pressure transducers (water, gas).} A 4--20\,mA
transmitter's loop current is recovered from a shunt-resistor voltage
$V$ (itself an oversampled ADC mean) and mapped to pressure with a
two-stage linear transform:

\begin{align}
  I &= \frac{V}{R_{\text{shunt}}} \times 1000 \quad \text{(mA)}
  \label{eq:current} \\
  P &= \mathrm{clamp}\!\left(
        \frac{I - I_{\min}}{I_{\max} - I_{\min}} \times P_{\max},\;
        0,\; P_{\max}\right)
  \label{eq:pressure}
\end{align}

\noindent with the transmitter's rated $I_{\min}=4\,\text{mA}$,
$I_{\max}=20\,\text{mA}$. Values of $I$ outside a wider tolerance band
$[I_{\text{err,lo}}, I_{\text{err,hi}}]$ (e.g., $I \approx 0$, indicating a
broken loop) are flagged as faulty \emph{before} Eq.~\eqref{eq:pressure}
is applied, rather than silently clamping to the pressure range's
boundary as Eq.~\eqref{eq:pressure} alone would do.

\paragraph{Exponential smoothing.} Several channels apply a first-order
IIR low-pass (an exponential moving average) to a noisy but otherwise
valid reading before display or transmission:

\begin{equation}
  \hat{x}_t \;=\; \alpha\, x_t + (1-\alpha)\, \hat{x}_{t-1},
  \qquad \alpha \in (0,1].
\label{eq:ema}
\end{equation}

A subtlety we highlight for reproducibility: Eq.~\eqref{eq:ema} must be
seeded with $\hat{x}_0 = x_0$ (not $\hat{x}_0=0$) on the first genuinely
valid reading following a boot or a fault-recovery event, or the filter's
own startup transient is visually indistinguishable from a real,
slowly-rising physical signal for several sampling intervals.

\subsection{Bounded-latency design for oversampled reads}

An oversampled ADC read of $k$ samples over an intermittently --- not
permanently --- unresponsive I2C bus can, in the worst case, spend up to
the bus driver's own per-transaction timeout $\tau$ on every sample:

\begin{equation}
  T_{\text{read}}^{\max} \;=\; k\, \tau.
\label{eq:oversample-worst}
\end{equation}

For $k=16$ and $\tau = 50\,\text{ms}$ (a value chosen specifically so a
genuinely wedged bus cannot hang the read forever), Eq.~\eqref{eq:oversample-worst}
gives an bound of 800\,ms for a \emph{single} channel read --- large
enough, across a two-channel sensor, to noticeably stall a control loop
that also owes service to a watchdog and a network stack on a fixed
budget. We replace the fixed sample count with an early-exit rule that
still guarantees a minimum sample count $k_{\min}$ for measurement
quality under normal conditions:

\begin{equation}
  \text{stop after sample } i \text{ if } \;
  i \ge k_{\min} \;\wedge\; \sum_{j=1}^{i} t_j > B,
\label{eq:oversample-bound}
\end{equation}

\noindent where $t_j$ is the wall-clock cost of sample $j$ and $B$ is a
time budget chosen well below $k\tau$. With $k_{\min}=k/2=8$ and
$B=150\,\text{ms}$, the realized worst case is
$k_{\min}\tau = 400\,\text{ms}$ --- a factor-of-two reduction --- while a
healthy bus (every $t_j \ll \tau$) is unaffected, since the budget is
never reached before all $k$ samples complete.

\begin{figure}[h]
\centering
\includegraphics[width=0.68\textwidth]{oversample_latency.pdf}
\caption{Worst-case per-channel read latency under Eq.~\eqref{eq:oversample-worst}
(fixed $k=16$ samples) versus the budgeted early-exit rule of
Eq.~\eqref{eq:oversample-bound} ($k_{\min}=8$, $B=150$\,ms) --- a
factor-of-two reduction in the worst case, with no change to normal-case
sample count or latency.}
\label{fig:oversample-latency}
\end{figure}

\subsection{A conservatively reverted fix: receive-side frame checksums}

The metering protocol described in the companion paper's \S~2.3
computes a 16-bit checksum over every transmitted frame but --- as
originally implemented --- never verified that checksum on \emph{receipt}.
On a physically noisy RS-485 line, a corrupted-but-structurally-plausible
frame (correct start/end delimiters, corrupted payload) would be parsed
as trusted data, silently producing a numerically wrong --- not
obviously invalid --- meter reading. We implemented and compile-verified
a receive-side check mirroring the transmit-side checksum computation.

We then reverted it. The reasoning, made explicit here because we
consider it methodologically the most important result in this section:
the checksummed byte range on receive must \emph{exactly} match the byte
range checksummed on transmit, and this equivalence had only been
verified by code inspection and successful compilation --- never against
a real meter, over a real cable, with real electrical noise. An
off-by-one in the checksummed range would not manifest as a compile
error, nor as an obviously wrong value; it would manifest as \emph{every}
real-hardware read being silently rejected as ``corrupted,'' which is a
strictly worse outcome for the platform's core function (metering) than
the noise-corruption risk the check was meant to catch. Absent a
hardware-in-the-loop test able to distinguish these two outcomes before
a fleet-wide deployment, we judged the fix's downside risk to dominate
its upside, and reverted to the pre-existing (unverified-on-receive, but
field-proven) behavior. The check remains implemented in version control
and is a candidate for re-introduction once bench-validated against a
physical meter.
"""

A2_RESULTS = r"""
Table~\ref{tab:defects} summarizes the sixteen defects by class,
cross-referenced against the layer of the system in which each was found.
All fixes except the one described in \S~2.5 remain in the deployed
firmware at the time of writing; every fix was verified by a full
recompilation of every affected PlatformIO build target (up to fifteen
per change) before being considered complete, with zero regressions
introduced across the audit.

\begin{table}[h]
\centering
\small
\begin{tabular}{@{}l l p{7.6cm}@{}}
\toprule
\textbf{Class} & \textbf{Count} & \textbf{Representative instance} \\
\midrule
A --- unbounded blocking, no watchdog
  & 4
  & 7 of 32 build configurations never registered with the task
    watchdog; one bring-up firmware path contained a genuine
    unconditional infinite loop on missing hardware. \\
B --- sensor fault masking
  & 5
  & A disconnected soil probe reported a plausible 0\% reading
    indefinitely; a disconnected microphone's boot-time calibration
    silently substituted a fixed baseline, reporting ``quiet room''
    forever. \\
C --- unbounded allocation
  & 2
  & A chunked (unknown-length) HTTP response was fully buffered
    \emph{before} a size limit was checked, defeating the limit's
    purpose. \\
D --- boot-time race conditions
  & 3
  & An I2C display driver's one-shot boot probe, if it lost a timing
    race against the display module's own power-up, left the screen
    blank for the entire session with no retry. \\
Other (protocol/timing/config)
  & 2
  & A Wi-Fi captive-configuration portal disabled the station radio for
    its full duration with no bounded fallback; a bridge polling cycle's
    internal timeout exceeded its own nominal reply window. \\
\bottomrule
\end{tabular}
\caption{Sixteen defects found across four audit passes, by class.}
\label{tab:defects}
\end{table}

\begin{figure}[h]
\centering
\includegraphics[width=0.72\textwidth]{defect_taxonomy.pdf}
\caption{Defect counts by class (Table~\ref{tab:defects}). Class~B (sensor
fault masking) is the largest single category despite none of its
instances being able to hang or crash the device --- see the discussion
of silent-versus-loud failure in \S~4.}
\label{fig:defect-taxonomy}
\end{figure}

The Class D instance is worth calling out as a second-order finding: it
was \emph{introduced} by an earlier, well-intentioned fix in the same
audit (making a display driver's ``is the hardware present'' flag
honestly reflect a failed probe, rather than always optimistically
reporting success) that inadvertently removed the only code path that
would have retried the probe. This is a direct instance of the audit's
own pass-4 methodology (\S~2.1) catching a defect in its own earlier
output, and we regard it as evidence for treating every fix as subject
to the same scrutiny as the code it replaces, not as an exception to it.
"""

A2_DISCUSSION = r"""
\textbf{Silent correctness failures dominate.} Of the sixteen defects,
the five in Class B (sensor fault masking) are, in our judgment, the
most consequential despite none of them being able to crash or hang the
device: a system that is up, responsive, and reporting numbers that are
simply wrong is harder to detect and diagnose in production than one
that is visibly down. We suggest this asymmetry --- crashes are
self-reporting, silent wrong-answers are not --- as a general prioritization
heuristic for embedded reliability audits operating under limited time:
audit for Class B before Class A, even though Class A defects (hangs,
watchdog gaps) are often easier to find via static inspection.

\textbf{A compile matrix is a necessary but not sufficient regression
gate.} Recompiling all affected build targets after every change caught
zero silent breakages across sixteen fixes in this audit --- itself a
useful negative result, suggesting the codebase's build configuration
matrix was already reasonably decoupled per sensor type. However, a
successful compile says nothing about runtime correctness on the
specific hardware a firmware image targets, as the reverted checksum fix
in \S~2.5 illustrates directly: that fix compiled cleanly across every
relevant target and was, by every static-inspection criterion available
to us, apparently correct. We regard hardware-in-the-loop testing --
not yet performed for this fleet at the time of writing -- as the single
highest-value remaining verification step, and recommend it explicitly
be budgeted as a distinct phase from code review in future firmware
reliability work, rather than treated as an optional follow-up.

\textbf{Limitations.} This audit was conducted entirely through static
code review and compile-time verification; no physical fault injection
(e.g., deliberately disconnecting a sensor mid-operation, introducing
line noise on the RS-485 bus, or brown-out testing under a marginal
power supply) was performed. Several of the findings reported here ---
the soil-moisture and pressure-transducer fault predicates in particular
--- were validated only against the sensors' documented calibration
behavior, not against a population of physical units exhibiting real
failure modes. We consider the results reported here a necessary
precondition for, rather than a substitute for, field validation.

\textbf{Future work.} Three items follow directly from this audit: (1)
hardware-in-the-loop validation of the reverted receive-side checksum
(\S~2.5), after which it should be re-introduced if confirmed safe; (2)
a brown-out and power-supply-margin test campaign, since the
watchdog/reliability work in this audit was necessarily reactive to a
documented but unmeasured platform-level brown-out risk rather than
addressing it at the root cause; (3) extending the compile-matrix
methodology (\S~2.1) into an automated regression suite triggered on
every firmware change, rather than the manually-invoked verification
process used during this audit.
"""

# ─────────────────────────────────────────────────────────────────────────────
# ARTICLE 3 — AI-assisted software engineering methodology (meta-paper)
# ─────────────────────────────────────────────────────────────────────────────

A3_TITLE = "Multi-Agent LLM Orchestration for Embedded Systems Reliability Auditing: A Methodology and Case Study"
A3_SHORT = "Multi-Agent LLM Orchestration for Reliability Auditing"
A3_KEYWORDS = "AI-assisted software engineering, large language model agents, multi-agent orchestration, verification gates, human-in-the-loop, embedded systems"

A3_ABSTRACT = r"""
Large language model (LLM) coding agents are increasingly used not just to
write code but to \emph{audit} it --- reading an existing codebase, finding
defects, implementing fixes, and verifying them. This raises a
methodological question distinct from ``can an LLM write correct code'':
how should such audits be \emph{structured} so that their output is
trustworthy, and where must human judgment remain load-bearing? We report
on the methodology used to conduct the firmware reliability audit
described in a companion case-study paper, in which sixteen defects across
32 embedded build configurations were found and fixed using a multi-agent
LLM orchestration pattern: independent parallel agents scoped to
non-overlapping files for each audit and fix pass, a compile-matrix
verification gate that every change had to survive before being considered
complete, and explicit human authorization at every escalation from
read-only audit to code modification to production deployment. We report
the methodology's structure, quantify its verification coverage, and
present two illustrative episodes in detail: a fix that was implemented,
passed every static and compile-time check available, and was then
deliberately reverted by human judgment because its correctness depended
on a property (byte-range equivalence in a checksum computation) that
could only be verified against physical hardware not available during the
audit; and an incident in which a second, independent AI-assisted session
operating on the same shared repository silently absorbed the audit's
in-progress, not-yet-authorized commits into its own unrelated commits,
surfaced only by manual git-history inspection. We draw methodological
lessons for practitioners structuring similar human--AI collaborative
audits.
"""

A3_INTRO = r"""
The premise of this paper is narrower than ``LLMs can write code'' and
more specific than ``LLMs can find bugs'': it is about the \emph{process}
by which an LLM-based coding agent's output becomes trustworthy enough to
ship into a fleet of physical, field-deployed devices it will never itself
observe running. This is a meaningfully harder bar than passing a code
review, because embedded firmware for real hardware has a property much
web or backend software does not: a large fraction of its failure modes
are simply invisible to static analysis, unit tests, or even a clean
compile, and only manifest against the real electrical and timing
behavior of physical peripherals.

We report on the methodology used to conduct a systematic reliability
audit of the firmware fleet described in a companion paper --- 32
PlatformIO build configurations across six utility-sensor types --- in
which an LLM coding agent, directed by a human engineer, found and fixed
sixteen defects across four audit passes. Rather than repeating that
paper's defect-level findings, this paper asks: what \emph{structure} did
the audit itself have, what made its output trustworthy enough to deploy,
and what went wrong in the process along the way?

Two process failures are reported here in detail because we consider them
more broadly instructive than most of the individual code defects. First,
one fix --- a receive-side checksum verification, intended to reject
corrupted serial-protocol frames --- was implemented, and it passed every
check available to the process: it compiled, it matched the surrounding
code's style and conventions, and static re-reading of the change found no
fault with it. It was then reverted anyway, on the judgment that its
correctness depended on a specific claim (that the byte range checksummed
on receive exactly matched the byte range checksummed on transmit) that
the audit's available tools --- a compiler and a careful human or AI
reader --- were fundamentally unable to verify, because verifying it
required exercising the code against a real meter over a real cable. This
is, we argue, the sharpest illustration available from this audit of where
LLM-assisted verification's ceiling actually is.

Second, partway through the audit, independent inspection of the
repository's git history revealed that a second AI-assisted session ---
working on an unrelated feature, in the same working directory, at the
same time --- had been running broad-scope commits (\code{git add -A} or
equivalent) that silently absorbed the audit's in-progress, not-yet-
reviewed changes into its own commits, under unrelated commit messages,
and had already pushed them to the shared remote. No data was lost and no
incorrect code shipped as a result, but the incident surfaced a
coordination failure category that is specific to multi-agent,
multi-session AI-assisted development and that we believe is under-
discussed in current practice: two independent agents, each individually
well-behaved, can still interfere with each other purely through shared,
un-versioned \emph{intent} about who is allowed to commit what, when.

Our contributions are: (1) a description of a parallel-agent,
scoped-file, compile-gated orchestration pattern for LLM-assisted code
auditing, applied to an embedded systems case study; (2) a report of the
pattern's verification coverage and its growth over the course of the
audit; (3) a detailed account of a conservatively-reverted fix as a
worked example of the boundary between what static/compile-time
verification can and cannot establish; and (4) a first-hand account of a
concurrent-session git-coordination failure, offered as a concrete
instance of a risk category we expect to recur as multi-agent AI-assisted
development becomes more common.
"""

A3_METHODS = r"""
\subsection{Orchestration pattern}

The audit was structured as a sequence of phases, each following the same
three-stage pattern, illustrated in Figure~\ref{fig:orchestration}.

\begin{enumerate}
\item \textbf{Parallel, scoped audit.} For a given layer of the system
  (e.g., sensor calibration logic; RS-485 bus timing; ESP32 platform
  primitives), several agents were run concurrently, each assigned a
  disjoint subset of files or a distinct architectural concern, and each
  instructed to read full file contents rather than diffs and to report
  concrete, file-and-line-cited findings rather than general impressions.
  Running agents in parallel over disjoint scope, rather than one agent
  sequentially over the whole codebase, was a deliberate choice: it
  bounds each agent's context to what it can plausibly reason about
  completely, and it makes the audit's total wall-clock cost roughly
  independent of how many subsystems are reviewed.
\item \textbf{Human synthesis and authorization.} Findings from all
  parallel agents were consolidated, prioritized by the human engineer,
  and explicitly scoped before any code was modified --- including, in
  one documented instance (Article 2, \S~2.5's checksum fix), an explicit
  human instruction to exclude a specific, already-identified finding
  from the authorized fix set pending separate risk judgment.
\item \textbf{Parallel, scoped fix, then a compile-matrix gate.} Once a
  fix set was authorized, implementation again used parallel agents with
  disjoint file ownership (to avoid concurrent-edit conflicts on the same
  file), followed by a dedicated verification pass: a full recompilation
  of every PlatformIO build configuration plausibly affected by the
  change set. A fix was not considered complete until this gate passed;
  a gate failure routed back to fix implementation rather than being
  treated as acceptable residual risk.
\end{enumerate}

\begin{figure}[h]
\centering
\resizebox{0.92\textwidth}{!}{%
\begin{tikzpicture}[
  box/.style={draw, rounded corners=2pt, minimum height=1.0cm, align=center,
    font=\small, line width=1pt, fill=white, inner sep=6pt},
  dec/.style={draw, diamond, aspect=2.4, align=center, font=\scriptsize,
    line width=1pt, fill=white, inner sep=2pt},
  arr/.style={-{Latex[length=2.4mm]}, line width=0.9pt, draw=PalMuted},
  lbl/.style={font=\scriptsize, text=PalMuted, align=center}
]
  \node[box, draw=PalBlue, minimum width=2.6cm] (audit) at (0,0)
    {Parallel scoped\\audit agents};
  \node[box, draw=PalYellow, minimum width=2.6cm, right=1.6cm of audit] (human)
    {Human synthesis\\\& authorization};
  \node[box, draw=PalGreen, minimum width=2.6cm, right=1.6cm of human] (fix)
    {Parallel scoped\\fix agents};
  \node[dec, right=1.5cm of fix, minimum width=2.0cm] (gate)
    {compile-\\matrix\\gate};
  \node[box, draw=PalAqua, minimum width=2.2cm, right=1.6cm of gate] (deploy)
    {Deploy};

  \draw[arr] (audit) -- (human);
  \draw[arr] (human) -- (fix);
  \draw[arr] (fix) -- (gate);
  \draw[arr] (gate) -- node[lbl, above]{pass} (deploy);
  \draw[arr, PalRed] (gate.north) to[out=100,in=80,looseness=1.6]
    node[lbl, above]{fail} (fix.north);
\end{tikzpicture}}
\caption{The three-stage orchestration pattern repeated across each audit
phase: parallel scoped audit agents feed a human synthesis/authorization
step, which scopes a parallel scoped fix pass, gated by full compile-matrix
recompilation before deployment; a gate failure routes back to fix
implementation rather than being accepted as residual risk.}
\label{fig:orchestration}
\end{figure}

\subsection{Verification coverage}

The compile-matrix gate's coverage was not static: it grew over the
course of the audit as previously-uncovered build configurations were
identified as deserving verification. Figure~\ref{fig:ci-growth} reports
this growth across three points: the audit's starting continuous-
integration matrix (8 build configurations, chosen as one representative
target per utility-sensor type); an intermediate expansion after the
audit identified that two additional build configurations, originally
treated as bench-test-only, were in fact used as passively field-deployed
diagnostic tools and therefore deserved the same regression protection as
production targets; and the full verification gate applied to the
audit's final phase, which recompiled fifteen build configurations ---
including every diagnostic/bring-up mode touched by that phase's changes
--- before any fix in that phase was considered complete.

\begin{figure}[h]
\centering
\includegraphics[width=0.62\textwidth]{ci_matrix_growth.pdf}
\caption{Growth of compile-verification coverage over the audit. The
matrix widened as the audit itself discovered previously-uncovered,
field-relevant build configurations --- the verification net grew because
the audit's own findings changed what counted as ``in scope,'' not
because of a plan fixed in advance.}
\label{fig:ci-growth}
\end{figure}

\subsection{A formal decision rule for the reverted fix}

The checksum fix reverted in Article 2 \S~2.5 is worth formalizing,
because the decision to revert was not ad hoc: it follows from a simple
expected-cost argument available whenever a fix's correctness depends on
a claim that static verification cannot settle. Let $p$ be the
(unknown, unmeasurable-by-static-means) probability that the fix's
critical claim holds --- here, that the transmit- and receive-side
checksummed byte ranges are exactly equivalent. Let $C_{\text{FP}}$ be the
cost incurred if the fix ships and the claim is \emph{false} (every real
hardware read is silently rejected as corrupted --- a fleet-wide failure
of the platform's core metering function), and $C_{\text{FN}}$ the cost
of reverting when the claim was in fact \emph{true} (foregone protection
against the comparatively rare event of genuine line-noise corruption,
which the pre-existing, field-proven behavior had already been operating
under). Shipping is only justified in expectation when

\begin{equation}
p \, C_{\text{FN}} \;>\; (1-p)\, C_{\text{FP}}
\quad\Longleftrightarrow\quad
p \;>\; \theta \;=\; \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}}.
\label{eq:revert-threshold}
\end{equation}

\noindent Here $C_{\text{FP}} \gg C_{\text{FN}}$ --- a fleet-wide loss of
the core metering function dominates a missed opportunity to catch rare
noise --- so $\theta \to 1$: shipping is only justified at very high
confidence. Critically, the audit's available verification tools (a
compiler; a careful re-reading of the transmit- and receive-side byte-
range arithmetic) could establish internal consistency but could not
establish $p$ close enough to 1 to clear a threshold that high, because
the claim is fundamentally about \emph{runtime behavior of physical
hardware}, not about the code's static structure.
Eq.~\eqref{eq:revert-threshold} is offered as a reusable framing for similar decisions: when a
fix's risk asymmetry is large and its critical correctness claim is
outside what your available verification method can settle, the correct
default is to not ship, regardless of how confident static inspection
feels.

\subsection{The concurrent-session incident}

Approximately midway through the audit, a routine pre-commit check
(\code{git fetch} plus a diff against the remote) surfaced that the
working directory's git history contained commits the audit had not
authored, under commit messages describing an unrelated feature (a
database schema migration), whose diffs nonetheless included the audit's
own in-progress, not-yet-authorized changes to CI/CD configuration and
firmware files. Reconstructing the timeline from commit timestamps and
file diffs established that a second AI-assisted session, working
concurrently on the same repository checkout for an unrelated purpose,
had run broad-scope commits (consistent with \code{git add -A} or
equivalent) that captured whatever was in the working tree at that
moment --- including the audit's uncommitted edits --- and pushed the
result to the shared remote, all without any signal visible to either
session that the other was active.

No commit was lost, no incorrect code reached production as a direct
result (the swept-in commits were independently re-verified before
being trusted), and the incident was resolved by direct communication
with the repository owner. We report it not as a failure of either
individual session's behavior --- both, examined separately, behaved
reasonably given their own instructions --- but as a coordination gap
that is specific to this development mode: two agents, each respecting
the specific files and commits they were told about, had no shared
mechanism for learning about each other's existence at all.
"""

A3_RESULTS = r"""
Table~\ref{tab:process} summarizes the audit's process-level metrics,
distinct from the defect-level results already reported in the companion
paper.

\begin{table}[h]
\centering
\small
\begin{tabular}{@{}p{5.4cm} p{7.3cm}@{}}
\toprule
\textbf{Metric} & \textbf{Value} \\
\midrule
Audit/fix phases (parallel-agent orchestrated) & 3, each following the
  pattern in Figure~\ref{fig:orchestration} \\
Build configurations in final compile gate & 15, up from an initial 8 \\
Defects found and fixed (companion paper) & 16, across 4 defect classes \\
Fixes reverted after passing every static/compile check & 1, documented
  in \S~2.3 \\
Regressions introduced across all fixes (per the compile gate) & 0 \\
Pre-existing, audit-unrelated defect caught incidentally by the compile
  gate & 1 (a latent function-signature mismatch left over from an
  earlier, unrelated refactor, in a build configuration the gate happened
  to cover) \\
\bottomrule
\end{tabular}
\caption{Process-level metrics for the three orchestrated audit/fix
phases, as distinct from the defect-level results reported in the
companion case-study paper.}
\label{tab:process}
\end{table}

The zero-regressions result is a genuine finding, not a tautology: the
compile gate recompiles every targeted build configuration from source
after every change, so a regression would manifest as a build failure
requiring the same fix-and-re-verify loop shown in
Figure~\ref{fig:orchestration}'s feedback edge. That loop was never
exercised by an audit-introduced regression across sixteen fixes; it was
exercised once, but by a defect the audit did not introduce --- the
latent, pre-existing signature mismatch noted in Table~\ref{tab:process}
--- which the gate caught only because the affected build configuration
happened to be within that phase's verification scope, itself a direct
consequence of the coverage growth reported in
Figure~\ref{fig:ci-growth}.
"""

A3_DISCUSSION = r"""
\textbf{A compile gate is necessary but its ceiling is lower than it
feels.} The zero-regression record across sixteen fixes is genuine
evidence that a parallel-agent, scoped-file, compile-gated pattern can
produce a large volume of verified change without introducing new
breakage. But the reverted fix in \S~2.3 is the sharper result: that fix
cleared every check the process had, including a full, green
compile-matrix run, and was wrong to ship anyway, because its critical
correctness claim was never the kind of claim a compiler --- or a
careful reader, AI or human --- can settle. We think this is the central
methodological lesson of the audit: a compile-gated verification process
should be read as bounding \emph{one class} of risk (does the code build
and does its logic hold up to inspection) and explicitly not as bounding
risk that depends on real-world, physical, or runtime properties outside
that method's reach. Eq.~\eqref{eq:revert-threshold} is offered as a way
to make that boundary an explicit part of the process, rather than a
judgment call made silently and inconsistently fix-by-fix.

\textbf{Human authorization at phase boundaries did meaningful work.}
Every transition from read-only audit to code modification, and from
code modification to the specific act of pushing to a shared remote, was
gated on an explicit human decision in this audit --- including, notably,
the human overriding an agent's completed, verified work in the reverted-
fix case. We do not have a controlled comparison against an audit without
this gating, but we note that the one case where the process's own
verification (compile-matrix) was insufficient was also exactly the case
where human judgment, not tooling, supplied the missing signal (recognizing
that the claim at stake was unverifiable by the available method at all,
not merely unverified so far). This suggests human authorization is most
valuable not as a rubber stamp on agent output generally, but specifically
at the boundary of what the process's own verification method can reach.

\textbf{Concurrent AI-assisted sessions need an explicit coordination
mechanism, not just good individual behavior.} The git-collision incident
in \S~2.4 was not caused by either session behaving incorrectly relative
to its own instructions; it was caused by the absence of any shared
signal that a second session existed at all. As LLM-assisted development
sessions become cheaper to run concurrently, we expect this failure mode
to recur, and we do not think it is solved by more careful individual
agent behavior --- it requires an explicit protocol (e.g., a
session-visible lock, a shared status log, or a policy against broad-scope
commits from automated sessions) external to any single agent's own
good judgment.

\textbf{Limitations.} This is a single case study of one audit conducted
by one human--AI pairing on one codebase; we make no claim that the
specific numbers reported here (three phases, fifteen build
configurations, one reverted fix) generalize quantitatively to other
projects. The process-level claims --- that scoped parallel agents plus a
compile gate plus human boundary authorization produced zero
audit-introduced regressions --- are also self-reported by the same
process being evaluated, without an independent auditor checking the
auditors; we consider external replication, ideally by a team not
otherwise involved in the codebase, the natural next step before treating
this pattern as validated rather than promising.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Assembly
# ─────────────────────────────────────────────────────────────────────────────


def build_document(
    title: str,
    short: str,
    keywords: str,
    abstract: str,
    intro: str,
    methods: str,
    results: str,
    discussion: str,
    methods_heading: str = "Methods",
) -> str:
    return (
        PREAMBLE
        + title_block(title, short, keywords)
        + r"\begin{abstract}" + "\n" + abstract + "\n" + r"\end{abstract}" + "\n\n"
        + r"\section{Introduction}" + "\n" + intro + "\n\n"
        + rf"\section{{{methods_heading}}}" + "\n" + methods + "\n\n"
        + r"\section{Results}" + "\n" + results + "\n\n"
        + r"\section{Discussion}" + "\n" + discussion + "\n\n"
        + r"\end{document}" + "\n"
    )


def write_and_compile(tex_source: str, stem: str) -> Path:
    BUILD_DIR.mkdir(exist_ok=True)
    tex_path = BUILD_DIR / f"{stem}.tex"
    tex_path.write_text(tex_source, encoding="utf-8")

    for pass_no in (1, 2):
        proc = subprocess.run(
            [
                "pdflatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                f"-output-directory={BUILD_DIR}",
                str(tex_path),
            ],
            cwd=BUILD_DIR,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            log_tail = "\n".join(proc.stdout.splitlines()[-60:])
            raise RuntimeError(
                f"pdflatex failed on pass {pass_no} for {stem}.tex:\n{log_tail}"
            )

    pdf_path = BUILD_DIR / f"{stem}.pdf"
    final_pdf = DOCS_DIR / f"{stem}.pdf"
    final_pdf.write_bytes(pdf_path.read_bytes())
    return final_pdf


def main() -> None:
    generate_figures.main()

    article1 = build_document(
        A1_TITLE, A1_SHORT, A1_KEYWORDS,
        A1_ABSTRACT, A1_INTRO, A1_METHODS, A1_RESULTS, A1_DISCUSSION,
        methods_heading="System Design and Methodology",
    )
    article2 = build_document(
        A2_TITLE, A2_SHORT, A2_KEYWORDS,
        A2_ABSTRACT, A2_INTRO, A2_METHODS, A2_RESULTS, A2_DISCUSSION,
        methods_heading="Methods",
    )
    article3 = build_document(
        A3_TITLE, A3_SHORT, A3_KEYWORDS,
        A3_ABSTRACT, A3_INTRO, A3_METHODS, A3_RESULTS, A3_DISCUSSION,
        methods_heading="Methods",
    )

    p1 = write_and_compile(article1, "article-1-system-architecture")
    print(f"[ok] {p1}")
    p2 = write_and_compile(article2, "article-2-reliability-engineering")
    print(f"[ok] {p2}")
    p3 = write_and_compile(article3, "article-3-ai-orchestration-methodology")
    print(f"[ok] {p3}")


if __name__ == "__main__":
    sys.exit(main())
