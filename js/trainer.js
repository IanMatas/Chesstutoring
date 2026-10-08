// trainer.js — Chess Training Module (Expanded)
// Opening Explorer, Midgame Strategy Scenarios, Endgame Mastery
// With randomized scenario generation, extensive openings, and interactive board play

const ChessTrainer = (() => {
    'use strict';

    /* ══════════════════════════════════════════════════════════════
       OPENING DATABASE — Comprehensive collection
       Each opening has:
       - name, eco, description
       - mainLine: array of { move (SAN), explanation }
       - keyIdeas: strategic concepts
       - commonTraps: pitfalls to avoid
       - counters: how the opponent can respond
       ══════════════════════════════════════════════════════════════ */
    const OPENINGS = {
        /* ── e4 Openings ── */
        'italian-game': {
            name: "Italian Game",
            eco: "C50-C54",
            icon: "🇮🇹",
            category: "e4 Openings",
            difficulty: "Beginner",
            description: "One of the oldest openings. White develops naturally, aiming for a strong center and kingside attack. Great for beginners learning fundamental opening principles.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "Claim the center. The e4 pawn controls d5 and f5, and opens lines for the queen and bishop." },
                { move: 'e5',  white: false, explanation: "Black mirrors White's strategy, fighting for central control." },
                { move: 'Nf3', white: true,  explanation: "Develop the knight to its best square. It attacks e5 and prepares to castle kingside." },
                { move: 'Nc6', white: false, explanation: "Defend the e5 pawn while developing. The knight controls d4 and e5." },
                { move: 'Bc4', white: true,  explanation: "The Italian move! The bishop targets the weak f7 square (only defended by the king). This is aggressive and principled." },
                { move: 'Bc5', white: false, explanation: "The Giuoco Piano (Quiet Game). Black mirrors with an active bishop targeting f2." },
                { move: 'c3',  white: true,  explanation: "Preparing d4 to build a strong pawn center. This is the main line of the Giuoco Piano." },
                { move: 'Nf6', white: false, explanation: "Develop and attack e4. Black puts pressure on White's center immediately." },
                { move: 'd4',  white: true,  explanation: "Strike in the center! White opens up the position with a strong pawn push." },
                { move: 'exd4', white: false, explanation: "Black captures, challenging White to prove the pawn sacrifice." },
                { move: 'cxd4', white: true,  explanation: "Recapture with a strong pawn center. White now has pawns on d4 and e4 — an ideal setup." },
                { move: 'Bb4+', white: false, explanation: "Black gives check to disrupt White's development before the center becomes too strong." },
            ],
            keyIdeas: [
                "Control the center with e4/d4 pawns",
                "Target the weak f7 square with Bc4",
                "Develop pieces quickly: knights before bishops",
                "Castle kingside early for king safety",
                "The Evans Gambit (b4) is a sharp alternative"
            ],
            commonTraps: [
                { name: "Legal's Mate Trap", description: "If Black plays carelessly: 1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Nc3 Bg4 5.Nxe5! Bxd1?? 6.Bxf7+ Ke7 7.Nd5# — Checkmate!" },
                { name: "Fried Liver Attack", description: "After 3...Nf6 4.Ng5 — White sacrifices a knight on f7 with 5.Nxf7!? for a devastating attack. Black must know the defense." }
            ],
            counters: [
                { name: "Two Knights Defense (3...Nf6)", description: "More aggressive than 3...Bc5. Black immediately attacks e4 and dares White to play the sharp Fried Liver." },
                { name: "Hungarian Defense (3...Be7)", description: "Solid but passive. Black avoids tactical complications but gives White easy development." }
            ],
            playAs: 'w'
        },

        'ruy-lopez': {
            name: "Ruy López (Spanish Opening)",
            eco: "C60-C99",
            icon: "🇪🇸",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "The king of openings! Named after a 16th-century Spanish priest. White puts pressure on the knight defending e5, creating long-term strategic tension.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "The classic king's pawn opening. Control the center." },
                { move: 'e5',  white: false, explanation: "Symmetrical response, fighting for space." },
                { move: 'Nf3', white: true,  explanation: "Attack e5 and develop toward the kingside." },
                { move: 'Nc6', white: false, explanation: "Defend e5 naturally." },
                { move: 'Bb5', white: true,  explanation: "The Ruy López! Put pressure on the knight that defends e5. The d7 pawn means it is not yet pinned to the king. This doesn't win the e5 pawn immediately (Bxc6 dxc6, Nxe5?? Qd4 wins it back), but it creates lasting pressure." },
                { move: 'a6',  white: false, explanation: "The Morphy Defense — asking the bishop 'where are you going?' This is the most popular response." },
                { move: 'Ba4', white: true,  explanation: "Retreat while keeping pressure on the knight. The bishop stays active on the a4-e8 diagonal." },
                { move: 'Nf6', white: false, explanation: "Attack e4 while developing. A double-duty move." },
                { move: 'O-O', white: true,  explanation: "Castle immediately! King safety first, then you can handle the center later." },
                { move: 'Be7', white: false, explanation: "Prepare to castle. The bishop on e7 is modest but solid." },
                { move: 'Re1', white: true,  explanation: "Support the e4 pawn and prepare for the central battle. The rook eyes the e-file." },
                { move: 'b5',  white: false, explanation: "Chase the bishop and gain space on the queenside. Now ...Na5 ideas are possible." },
                { move: 'Bb3', white: true,  explanation: "The bishop retreats to a safe diagonal. It still eyes f7." },
            ],
            keyIdeas: [
                "Long-term pressure on e5 through the Bb5 pin",
                "The 'd4 break' is White's key plan to open the center",
                "White aims for a space advantage and slow squeeze",
                "Maneuver Nd2-f1-g3 or e3 for a kingside attack",
                "The Marshall Attack (Black's ...d5) is a sharp counter to know"
            ],
            commonTraps: [
                { name: "Noah's Ark Trap", description: "If White isn't careful with the bishop on b3: Black plays ...Na5, ...c5, and ...c4 trapping the bishop with pawns!" },
                { name: "Fishing Pole Trap", description: "In some lines, Black plays ...Ng4 and ...Qf6 threatening mate on f2. Watch out after castling!" }
            ],
            counters: [
                { name: "Berlin Defense (3...Nf6)", description: "The 'Berlin Wall' — made famous by Kramnik. Leads to a queenless middlegame that's very solid for Black." },
                { name: "Marshall Attack (8...d5)", description: "A brilliant pawn sacrifice by Black for a ferocious attack. White must know the theory!" },
                { name: "Schliemann Defense (3...f5)", description: "Aggressive and risky. Black immediately fights for the center but weakens the kingside." }
            ],
            playAs: 'w'
        },

        'sicilian-defense': {
            name: "Sicilian Defense",
            eco: "B20-B99",
            icon: "🏝️",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "The most popular and successful response to 1.e4. Black creates an asymmetrical position, fighting for counterplay. Leads to rich, complex middlegames.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "White opens with the king's pawn." },
                { move: 'c5',  white: false, explanation: "The Sicilian! Instead of mirroring with ...e5, Black fights for the d4 square. This creates imbalance from move 1." },
                { move: 'Nf3', white: true,  explanation: "Develop and prepare d4. White wants to open the position." },
                { move: 'd6',  white: false, explanation: "The Najdorf/Classical setup. Support ...e5 later and keep options flexible." },
                { move: 'd4',  white: true,  explanation: "Open the center! White sacrifices the d4 pawn structure for piece activity." },
                { move: 'cxd4', white: false, explanation: "Capture toward the center. Black gets a semi-open c-file for the rook." },
                { move: 'Nxd4', white: true,  explanation: "Knight recaptures. White has more space but Black has the half-open c-file." },
                { move: 'Nf6', white: false, explanation: "Attack e4 and develop. Black's pieces come out fighting." },
                { move: 'Nc3', white: true,  explanation: "Defend e4 and develop. Now White must choose a system: Be2, Bc4, f3, or Be3." },
                { move: 'a6',  white: false, explanation: "The Najdorf! Prepare ...e5 or ...b5. This flexible move keeps all options open." },
            ],
            keyIdeas: [
                "Black gets a semi-open c-file for counterplay",
                "White has more central space but Black has dynamic chances",
                "Black's ...d5 break is the key equalizing move",
                "The position is asymmetric — both sides have winning chances",
                "Black often attacks on the queenside, White on the kingside"
            ],
            commonTraps: [
                { name: "Siberian Trap", description: "In the Rossolimo (3.Bb5+), after ...Nd7 and ...a6, Black can trap White's bishop if it retreats carelessly." },
                { name: "Poisoned Pawn", description: "In the Najdorf, 6.Bg5 e6 7.f4 Qb6 — Black grabs the b2 pawn. Extremely sharp and theory-heavy!" }
            ],
            counters: [
                { name: "For White: Closed Sicilian (2.Nc3)", description: "Avoid the Open Sicilian theory. White plays g3, Bg2, and slowly builds. Less sharp." },
                { name: "For White: Alapin (2.c3)", description: "Prepare d4 without entering main-line theory. Solid and positional." },
                { name: "For White: Grand Prix (2.Nc3/f4)", description: "Aggressive setup aiming for a kingside attack. Popular at club level." }
            ],
            playAs: 'b'
        },

        'french-defense': {
            name: "French Defense",
            eco: "C00-C19",
            icon: "🇫🇷",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "A solid, strategic opening. Black concedes the center initially but plans to undermine it with ...d5 and ...c5. The 'bad bishop' on c8 is Black's main challenge.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn opening." },
                { move: 'e6',  white: false, explanation: "The French! Prepare ...d5 to challenge the center. Solid but slightly passive." },
                { move: 'd4',  white: true,  explanation: "Claim maximum central space." },
                { move: 'd5',  white: false, explanation: "Now Black strikes! The central tension defines the French Defense." },
                { move: 'Nc3', white: true,  explanation: "The main line. Defend e4 and develop." },
                { move: 'Nf6', white: false, explanation: "Attack e4 again. Black increases the pressure on White's center." },
                { move: 'e5',  white: true,  explanation: "The Advance Variation! White gains space but the center becomes rigid. Black will target d4." },
                { move: 'Nfd7', white: false, explanation: "The knight retreats to prepare ...c5, the key break against d4." },
                { move: 'f4',  white: true,  explanation: "Support the e5 pawn and prepare a kingside attack." },
                { move: 'c5',  white: false, explanation: "The essential break! Black attacks the base of White's pawn chain (d4)." },
            ],
            keyIdeas: [
                "Black's key break is ...c5 against d4 — attack the pawn chain base",
                "The 'bad' light-squared bishop on c8 is Black's strategic problem",
                "Black often plays ...f6 to challenge e5 in the Advance Variation",
                "White aims for a kingside attack with f4-f5",
                "Know the Exchange (3.exd5) — leads to symmetrical, drawish play"
            ],
            commonTraps: [],
            counters: [
                { name: "Winawer Variation (3...Bb4)", description: "Pins the knight and creates complex play. White often plays 4.e5 leading to sharp positions." },
                { name: "Classical (3...Nf6)", description: "Natural development. After 4.e5 Nfd7, Black aims for ...c5 and piece play." },
                { name: "Tarrasch (3.Nd2)", description: "White avoids the Winawer pin. Less sharp but very solid." }
            ],
            playAs: 'b'
        },

        'caro-kann': {
            name: "Caro-Kann Defense",
            eco: "B10-B19",
            icon: "🛡️",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "Ultra-solid defense. Black supports ...d5 with the c-pawn, keeping the light-squared bishop free (unlike the French). Favored by players who want a solid, low-risk game.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn opening." },
                { move: 'c6',  white: false, explanation: "The Caro-Kann! Prepare ...d5 while keeping the light-squared bishop unblocked." },
                { move: 'd4',  white: true,  explanation: "Claim the center." },
                { move: 'd5',  white: false, explanation: "Now ...d5 is played with c6 support. The big advantage over the French: the bishop on c8 isn't blocked!" },
                { move: 'Nc3', white: true,  explanation: "Main line. White defends e4." },
                { move: 'dxe4', white: false, explanation: "Capture! Black simplifies the center and prepares ...Bf5." },
                { move: 'Nxe4', white: true,  explanation: "White has a centralized knight and more space." },
                { move: 'Bf5', white: false, explanation: "This is why Black played ...c6! The bishop develops actively outside the pawn chain. This is the Classical Caro-Kann." },
                { move: 'Ng3', white: true,  explanation: "Chase the bishop. White gains time." },
                { move: 'Bg6', white: false, explanation: "Retreat to a safe square. The bishop is still active." },
            ],
            keyIdeas: [
                "Black's light-squared bishop goes to f5 — the key advantage over the French",
                "Very solid pawn structure with few weaknesses",
                "Black's plan: complete development, then play ...c5 or ...e5 to challenge",
                "The Advance Variation (3.e5) gives White space but Black targets d4",
                "Good choice for players who want solid, strategic positions"
            ],
            commonTraps: [],
            counters: [
                { name: "Advance Variation (3.e5)", description: "White grabs space. Play becomes similar to the French but Black's bishop is free." },
                { name: "Fantasy Variation (3.f3)", description: "Aggressive! White prepares a big center with e4. Sharp and fun." },
                { name: "Exchange Variation (3.exd5)", description: "Simplifies quickly. White gets a slightly more active position but Black is very solid." }
            ],
            playAs: 'b'
        },

        'scotch-game': {
            name: "Scotch Game",
            eco: "C44-C45",
            icon: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
            category: "e4 Openings",
            difficulty: "Beginner",
            description: "White immediately opens the center with 3.d4. Less theory than the Ruy López, but leads to open, tactical positions. Kasparov revived it in the 1990s.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn opening." },
                { move: 'e5',  white: false, explanation: "Symmetric response." },
                { move: 'Nf3', white: true,  explanation: "Attack e5 and develop." },
                { move: 'Nc6', white: false, explanation: "Defend the pawn." },
                { move: 'd4',  white: true,  explanation: "The Scotch! Immediately open the center — no slow buildup needed." },
                { move: 'exd4', white: false, explanation: "Black captures. The center is now open." },
                { move: 'Nxd4', white: true,  explanation: "Recapture with the knight. White has a centralized knight and open lines." },
                { move: 'Nf6', white: false, explanation: "Develop and attack e4." },
                { move: 'Nc3', white: true,  explanation: "Defend e4 and develop the last minor piece." },
                { move: 'Bb4', white: false, explanation: "Pin the knight and put pressure on e4. Black develops actively." },
            ],
            keyIdeas: [
                "Immediate center opening — ideal for tactical players",
                "White's knight on d4 is very well-placed centrally",
                "Less theory to memorize than the Ruy López or Italian",
                "Open positions favor piece activity and tactics",
                "White must be careful not to overextend early"
            ],
            commonTraps: [
                { name: "Scotch Gambit", description: "After 4.Nxd4, White can play 4.Bc4 instead — the Scotch Gambit, offering a pawn for rapid development." }
            ],
            counters: [
                { name: "Classical (4...Bc5)", description: "Black develops aggressively, targeting d4 and f2. The most natural response." },
                { name: "Schmidt Variation (4...Nf6)", description: "Attack e4 immediately. Practical and solid." }
            ],
            playAs: 'w'
        },

        'kings-gambit': {
            name: "King's Gambit",
            eco: "C30-C39",
            icon: "⚔️",
            category: "e4 Openings",
            difficulty: "Advanced",
            description: "The most romantic opening in chess! White sacrifices the f-pawn for rapid development and a powerful central attack. Bobby Fischer called it 'a dashing effort.' Leads to wild, tactical games.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn opening." },
                { move: 'e5',  white: false, explanation: "Symmetric center." },
                { move: 'f4',  white: true,  explanation: "The King's Gambit! White offers the f-pawn to deflect Black's e5 pawn and open the f-file for attack. Brave and aggressive!" },
                { move: 'exf4', white: false, explanation: "Black accepts the gambit. Now White needs to prove compensation." },
                { move: 'Nf3', white: true,  explanation: "Develop and prevent ...Qh4+ (which would be annoying). The knight eyes d4 and g5." },
                { move: 'd6',  white: false, explanation: "The Fischer Defense! Bobby Fischer's favorite reply — solid and principled." },
                { move: 'd4',  white: true,  explanation: "Seize the center with a massive pawn duo. This is what White sacrificed for." },
                { move: 'g5',  white: false, explanation: "Black tries to hold the extra pawn. But this weakens the kingside..." },
                { move: 'h4',  white: true,  explanation: "Challenge the g5 pawn immediately. White wants to pry open lines to the black king." },
                { move: 'g4',  white: false, explanation: "Push the knight away, but the kingside is getting very loose." },
            ],
            keyIdeas: [
                "White sacrifices a pawn for central control and the f-file",
                "Quick development and king safety (castle quickly!) are paramount",
                "The f-file will become a highway for White's rook to attack",
                "White aims for Bc4 + d4, targeting f7 with all pieces",
                "Not objectively best, but leads to fun, attacking chess!"
            ],
            commonTraps: [
                { name: "Falkbeer Counter-Gambit (2...d5)", description: "Black declines the gambit and counter-sacrifices! After 3.exd5 e4, Black gains central control." }
            ],
            counters: [
                { name: "Declined (2...Bc5)", description: "Black simply develops, ignoring the gambit. Safe and solid." },
                { name: "Falkbeer (2...d5)", description: "Counter-gambit! Black strikes at the center immediately." },
                { name: "Modern Defense (3...d5)", description: "After accepting, Black challenges the center. Principled play." }
            ],
            playAs: 'w'
        },

        'petrovs-defense': {
            name: "Petrov's Defense",
            eco: "C42-C43",
            icon: "🇷🇺",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "Ultra-solid and symmetrical. Instead of defending e5, Black counter-attacks White's e4 pawn. A favorite of elite players seeking a draw with Black, but can be sharp too.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn." },
                { move: 'e5',  white: false, explanation: "Symmetric." },
                { move: 'Nf3', white: true,  explanation: "Attack e5." },
                { move: 'Nf6', white: false, explanation: "The Petrov! Instead of defending e5, Black counter-attacks e4. A symmetric, solid choice." },
                { move: 'Nxe5', white: true,  explanation: "White takes the free pawn. But Black can't take back immediately — 4...Nxe4? loses to 5.Qe2!" },
                { move: 'd6',  white: false, explanation: "Chase the knight away first, THEN recapture on e4." },
                { move: 'Nf3', white: true,  explanation: "Retreat the knight." },
                { move: 'Nxe4', white: false, explanation: "Now Black takes back. Material is equal." },
                { move: 'd4',  white: true,  explanation: "Claim central space with the d-pawn." },
                { move: 'd5',  white: false, explanation: "Solid central structure. The position is very balanced." },
            ],
            keyIdeas: [
                "Extremely solid — hard for White to get any advantage",
                "Key trap: after 3.Nxe5, Black must NOT play 3...Nxe4?? immediately (Qe2 wins)",
                "Black must play 3...d6 first, then take on e4",
                "The position is very symmetrical — a good drawing weapon",
                "White often plays d4, Bd3, and castles for a small space edge"
            ],
            commonTraps: [
                { name: "Stafford Gambit (3...Nc6!?)", description: "Instead of 3...d6, Black gambits a pawn with 3...Nc6 for tricky play. White must be careful!" }
            ],
            counters: [
                { name: "Classical (5.d4)", description: "White plays for a central advantage. The most common approach." },
                { name: "Cochrane Gambit (4.Nxf7!?)", description: "Wild! White sacrifices the knight for an attack on the king. Not fully sound but fun!" }
            ],
            playAs: 'b'
        },

        'vienna-game': {
            name: "Vienna Game",
            eco: "C25-C29",
            icon: "🏛️",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "A clever system opening. White develops Nc3 before Nf3, keeping the f-pawn free for a later f4 push. Combines the ideas of the King's Gambit with safer play.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn." },
                { move: 'e5',  white: false, explanation: "Symmetric." },
                { move: 'Nc3', white: true,  explanation: "The Vienna! Develop the knight but keep the f-pawn free. White plans f4 later." },
                { move: 'Nf6', white: false, explanation: "Develop and attack e4." },
                { move: 'f4',  white: true,  explanation: "The Vienna Gambit! A delayed King's Gambit with the knight already on c3 for extra support." },
                { move: 'exf4', white: false, explanation: "Accept the gambit. Similar to the King's Gambit but White is better prepared." },
                { move: 'd3',  white: true,  explanation: "Support e4 solidly. White will develop Bxf4 and castle." },
                { move: 'd5',  white: false, explanation: "Strike in the center while White is setting up." },
            ],
            keyIdeas: [
                "Nc3 before Nf3 keeps f4 available as a plan",
                "White can choose between a gambit (f4) or quiet play (Bc4, d3)",
                "The Vienna Gambit leads to positions similar to King's Gambit but safer",
                "Good surprise weapon — less studied than main lines",
                "In the quiet version, White plays Bc4, d3, f4 slowly"
            ],
            commonTraps: [],
            counters: [
                { name: "...d5 Counter (Frankenstein-Dracula)", description: "After 2.Nc3 Nf6 3.Bc4 Nxe4!? — the wild Frankenstein-Dracula variation. Very sharp!" },
                { name: "Declining (2...Nc6)", description: "Simple development. Black can play a standard game." }
            ],
            playAs: 'w'
        },

        'scandinavian-defense': {
            name: "Scandinavian Defense",
            eco: "B01",
            icon: "🇩🇰",
            category: "e4 Openings",
            difficulty: "Beginner",
            description: "The simplest response to 1.e4! Black immediately challenges the center with ...d5. The queen comes out early (after exd5 Qxd5), which breaks typical rules but is playable.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn." },
                { move: 'd5',  white: false, explanation: "The Scandinavian! Immediately challenge e4. Bold and direct." },
                { move: 'exd5', white: true,  explanation: "Accept the challenge. White wins a center pawn." },
                { move: 'Qxd5', white: false, explanation: "Recapture with the queen. Yes, this is early — but the queen is hard to harass effectively." },
                { move: 'Nc3', white: true,  explanation: "Develop with tempo! Attack the queen to gain time." },
                { move: 'Qa5', white: false, explanation: "The queen retreats to a5, staying active. From here it eyes e5 and d5." },
                { move: 'd4',  white: true,  explanation: "Claim the center. White has a nice pawn duo and development lead." },
                { move: 'Nf6', white: false, explanation: "Develop and prepare ...Bf5 or ...Bg4." },
                { move: 'Nf3', white: true,  explanation: "Natural development." },
                { move: 'Bf5', white: false, explanation: "Develop the bishop actively. This is the main plan in the Scandinavian." },
            ],
            keyIdeas: [
                "Black gets the queen out early but it's surprisingly hard to exploit",
                "After ...Qa5, Black aims for ...Bf5, ...e6, ...Bb4 — quick development",
                "The ...Nf6 variation (2...Nf6 instead of 2...Qxd5) is the modern approach",
                "Easy to learn — there's one main plan regardless of White's setup",
                "Good for beginners who want to avoid theory in other defenses"
            ],
            commonTraps: [],
            counters: [
                { name: "2...Nf6 (Modern Scandinavian)", description: "Instead of the queen recapture, Black plays 2...Nf6 and later recaptures with the knight. More modern." },
                { name: "Icelandic Gambit (2...Nf6 3.c4 e6)", description: "Black sacrifices a pawn for rapid development. Sharp and dangerous!" }
            ],
            playAs: 'b'
        },

        'pirc-defense': {
            name: "Pirc Defense",
            eco: "B07-B09",
            icon: "🌙",
            category: "e4 Openings",
            difficulty: "Intermediate",
            description: "A hypermodern defense. Black lets White build a big center, then counterattacks it. The fianchettoed bishop on g7 becomes a powerful weapon once the center opens.",
            mainLine: [
                { move: 'e4',  white: true,  explanation: "King's pawn." },
                { move: 'd6',  white: false, explanation: "The Pirc! Black is content to let White grab the center, planning to undermine it later." },
                { move: 'd4',  white: true,  explanation: "White takes the invitation and builds a big center." },
                { move: 'Nf6', white: false, explanation: "Develop and prepare ...g6, ...Bg7." },
                { move: 'Nc3', white: true,  explanation: "Support the center." },
                { move: 'g6',  white: false, explanation: "The key move — prepare the fianchetto. The bishop on g7 will be a monster." },
                { move: 'f4',  white: true,  explanation: "The Austrian Attack! White pushes aggressively. This is the sharpest line against the Pirc." },
                { move: 'Bg7', white: false, explanation: "Complete the fianchetto. The bishop aims at the center and queenside through d4." },
                { move: 'Nf3', white: true,  explanation: "Develop and prepare to castle." },
                { move: 'O-O', white: false, explanation: "Castle safely. Now Black will plan ...c5 or ...e5 to strike at the center." },
            ],
            keyIdeas: [
                "Hypermodern approach — let White build the center, then destroy it",
                "The Bg7 is the star piece — controls the long diagonal",
                "Black's breaks: ...c5 and ...e5 challenge d4",
                "After ...e5, if dxe5 dxe5, Black's pieces are very active",
                "White's Austrian Attack (f4) is aggressive but overextending"
            ],
            commonTraps: [],
            counters: [
                { name: "Austrian Attack (4.f4)", description: "White goes all-in with a massive center and kingside attack. Black must be precise." },
                { name: "Classical (4.Nf3)", description: "Solid development. Less committal than the Austrian Attack." }
            ],
            playAs: 'b'
        },

        /* ── d4 Openings ── */
        'queens-gambit': {
            name: "Queen's Gambit",
            eco: "D06-D69",
            icon: "👑",
            category: "d4 Openings",
            difficulty: "Beginner",
            description: "Not a true gambit! White offers the c4 pawn but can usually win it back. One of the most classical and reliable openings, favored by world champions for centuries.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "The queen's pawn opening. Controls e5 and c5, and opens the diagonal for the dark-squared bishop." },
                { move: 'd5',  white: false, explanation: "Black fights for the center symmetrically." },
                { move: 'c4',  white: true,  explanation: "The Queen's Gambit! White attacks d5 from the side. If Black takes, White gets a strong center with e4." },
                { move: 'e6',  white: false, explanation: "Queen's Gambit Declined — the most solid response. Black supports d5 but locks in the light-squared bishop." },
                { move: 'Nc3', white: true,  explanation: "Develop and add pressure to d5." },
                { move: 'Nf6', white: false, explanation: "Defend d5 and develop naturally." },
                { move: 'Bg5', white: true,  explanation: "Pin the knight! Now if Black plays ...Be7, White can exchange on f6 to damage Black's pawn structure." },
                { move: 'Be7', white: false, explanation: "Break the pin and prepare to castle." },
                { move: 'e3',  white: true,  explanation: "Support d4 and prepare to develop the light-squared bishop." },
                { move: 'O-O', white: false, explanation: "Get the king to safety." },
                { move: 'Nf3', white: true,  explanation: "Complete development. White has a comfortable setup with more space." },
                { move: 'Nbd7', white: false, explanation: "Develop the knight. Black plans ...c5 or ...c6 to challenge the center." },
            ],
            keyIdeas: [
                "White gets more space with d4+c4 pawns",
                "The 'minority attack' (b4-b5) is a key plan on the queenside",
                "Black's light-squared bishop is often 'bad' — blocked by e6 pawn",
                "Black should aim for ...c5 or ...e5 breaks to free the position",
                "If Black plays ...dxc4 (QGA), White plays e4 for a big center"
            ],
            commonTraps: [
                { name: "Elephant Trap", description: "After 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7 5.cxd5 exd5 6.Nxd5?? Nxd5! 7.Bxd8 Bb4+ — Black wins the queen back with interest!" }
            ],
            counters: [
                { name: "QGA (2...dxc4)", description: "Accept the gambit! Black takes the pawn and tries to hold it or use the tempo to develop. White usually recovers the pawn." },
                { name: "Slav (2...c6)", description: "Supports d5 without blocking the bishop. The light-squared bishop can develop to f5 or g4." },
                { name: "King's Indian Defense (1...Nf6 2...g6)", description: "Ignore the center! Fianchetto the bishop and strike with ...e5 or ...c5 later. Very dynamic." },
                { name: "Albin Counter-Gambit (2...e5!?)", description: "Black sacrifices a pawn for active play. Surprising and tricky!" }
            ],
            playAs: 'w'
        },

        'kings-indian': {
            name: "King's Indian Defense",
            eco: "E60-E99",
            icon: "🗡️",
            category: "d4 Openings",
            difficulty: "Advanced",
            description: "A fighting defense! Black allows White a big center, then counterattacks it. Beloved by Kasparov and Fischer. Leads to sharp, dynamic middlegames with chances for both sides.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Queen's pawn opening." },
                { move: 'Nf6', white: false, explanation: "The Indian Defense. Black doesn't commit to a pawn structure yet." },
                { move: 'c4',  white: true,  explanation: "Grab space. White aims for maximum central control." },
                { move: 'g6',  white: false, explanation: "The King's Indian! Fianchetto the bishop to g7 — a powerful piece aiming at the center and queenside." },
                { move: 'Nc3', white: true,  explanation: "Develop and control d5." },
                { move: 'Bg7', white: false, explanation: "The fianchetto is complete. The bishop is a monster on the long diagonal." },
                { move: 'e4',  white: true,  explanation: "White establishes a massive center. Four pawns on the 4th rank! But Black has a plan..." },
                { move: 'd6',  white: false, explanation: "Prepare ...e5, the key counterattack. Black is coiling like a spring." },
                { move: 'Nf3', white: true,  explanation: "Complete development." },
                { move: 'O-O', white: false, explanation: "Castle and get ready to strike with ...e5." },
                { move: 'Be2', white: true,  explanation: "Solid development. White prepares to castle." },
                { move: 'e5',  white: false, explanation: "BOOM! Black strikes at the center. This is the critical moment of the King's Indian." },
            ],
            keyIdeas: [
                "Black's plan: ...e5, then push ...f5-f4 for a kingside attack",
                "White's plan: expand on the queenside with c5, b4, a4",
                "The position often splits into two 'halves' — each side attacks one wing",
                "The Bg7 is Black's star piece — never trade it without compensation!",
                "Timing of ...e5 and ...f5 is critical — too early or late can be fatal"
            ],
            commonTraps: [],
            counters: [
                { name: "Sämisch (5.f3)", description: "White prepares Be3 and a slow squeeze. Takes away ...Ng4 ideas." },
                { name: "Four Pawns Attack (f4)", description: "White pushes f4 immediately — maximally aggressive. Black must counterattack fast!" },
                { name: "Fianchetto System (g3)", description: "White mirrors Black's setup. Leads to more positional play." }
            ],
            playAs: 'b'
        },

        'london-system': {
            name: "London System",
            eco: "D00",
            icon: "🇬🇧",
            category: "d4 Openings",
            difficulty: "Beginner",
            description: "A solid, easy-to-learn system. White develops the same way regardless of Black's setup. The dark-squared bishop goes to f4 early, creating a 'pyramid' structure. Perfect for beginners.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Start with the queen's pawn." },
                { move: 'd5',  white: false, explanation: "Black mirrors." },
                { move: 'Bf4', white: true,  explanation: "The London move! Develop the bishop BEFORE playing e3 (which would block it in). This is the key idea." },
                { move: 'Nf6', white: false, explanation: "Natural development." },
                { move: 'e3',  white: true,  explanation: "Now lock in the pawn structure. The bishop is already outside the chain." },
                { move: 'e6',  white: false, explanation: "Solid setup." },
                { move: 'Nf3', white: true,  explanation: "Develop the knight to its best square." },
                { move: 'c5',  white: false, explanation: "Black challenges d4." },
                { move: 'c3',  white: true,  explanation: "Support d4. White's structure is the classic 'London pyramid': pawns on c3-d4-e3." },
                { move: 'Nc6', white: false, explanation: "Develop." },
                { move: 'Nbd2', white: true,  explanation: "The knight develops to d2 (not c3) to support e4 later. A London trademark." },
                { move: 'Be7', white: false, explanation: "Prepare castling." },
            ],
            keyIdeas: [
                "Always play Bf4 BEFORE e3 — don't trap your own bishop!",
                "The 'London Pyramid': pawns on c3, d4, e3 — solid and flexible",
                "Knight goes to d2 (not c3) to support e4",
                "Castle kingside, then play for e4 to open the position",
                "Easy to learn — the setup works against almost anything Black plays"
            ],
            commonTraps: [],
            counters: [
                { name: "Early ...c5", description: "Black immediately challenges d4. White should support with c3." },
                { name: "King's Indian Setup (...g6, ...Bg7)", description: "Black fianchettoes and aims for ...e5. The Bg7 pressures d4." },
                { name: "...Bf5", description: "Black mirrors the London! Can lead to symmetrical positions." }
            ],
            playAs: 'w'
        },

        'nimzo-indian': {
            name: "Nimzo-Indian Defense",
            eco: "E20-E59",
            icon: "🧠",
            category: "d4 Openings",
            difficulty: "Advanced",
            description: "One of the most respected defenses in chess. Black pins the knight on c3 with ...Bb4, fighting for central control without committing pawns. Beloved by Botvinnik, Karpov, and Kasparov.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Queen's pawn opening." },
                { move: 'Nf6', white: false, explanation: "Indian setup." },
                { move: 'c4',  white: true,  explanation: "Claim space." },
                { move: 'e6',  white: false, explanation: "Prepare ...Bb4 and ...d5." },
                { move: 'Nc3', white: true,  explanation: "Develop and control d5." },
                { move: 'Bb4', white: false, explanation: "The Nimzo-Indian! Pin the knight to the king. This controls e4 indirectly — if White plays e4, the knight on c3 is pinned!" },
                { move: 'Qc2', white: true,  explanation: "The Classical variation. White protects against doubled pawns (if ...Bxc3+)." },
                { move: 'O-O', white: false, explanation: "Get the king safe." },
                { move: 'a3',  white: true,  explanation: "Ask the bishop: take or retreat?" },
                { move: 'Bxc3+', white: false, explanation: "Black gives up the bishop pair but doubles White's c-pawns — a structural weakness." },
                { move: 'Qxc3', white: true,  explanation: "Recapture. White has the bishop pair but doubled c-pawns." },
                { move: 'd5',  white: false, explanation: "Challenge the center. Black has solid piece play against the doubled pawns." },
            ],
            keyIdeas: [
                "The Bb4 pin controls e4 indirectly — knight can't move to allow e4",
                "Black often doubles White's pawns with ...Bxc3 — a strategic trade",
                "The bishop pair vs doubled pawns is the central strategic tension",
                "Black's piece activity compensates for giving up a bishop",
                "White must decide: play a3 to resolve tension, or let it stay?"
            ],
            commonTraps: [],
            counters: [
                { name: "Rubinstein (4.e3)", description: "Solid and classical. White accepts the possibility of doubled pawns." },
                { name: "Kasparov (4.Nf3)", description: "Flexible approach. Avoids the main Nimzo lines temporarily." },
                { name: "Sämisch (4.a3)", description: "Force the issue immediately! Black must give up the bishop or retreat." }
            ],
            playAs: 'b'
        },

        'grunfeld-defense': {
            name: "Grünfeld Defense",
            eco: "D70-D99",
            icon: "💥",
            category: "d4 Openings",
            difficulty: "Advanced",
            description: "Black deliberately allows White to build a massive center, then blasts it apart! The fianchettoed bishop and central pawn breaks (...c5 and ...d5) are the wrecking ball.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Queen's pawn." },
                { move: 'Nf6', white: false, explanation: "Indian setup." },
                { move: 'c4',  white: true,  explanation: "Claim space." },
                { move: 'g6',  white: false, explanation: "Fianchetto coming — but not the King's Indian..." },
                { move: 'Nc3', white: true,  explanation: "Develop and support e4." },
                { move: 'd5',  white: false, explanation: "The Grünfeld! Black challenges the center immediately instead of playing ...d6 (King's Indian)." },
                { move: 'cxd5', white: true,  explanation: "White takes, getting a big center." },
                { move: 'Nxd5', white: false, explanation: "Recapture with the knight, attacking c3." },
                { move: 'e4',  white: true,  explanation: "The ideal center! But Black is planning to destroy it..." },
                { move: 'Nxc3', white: false, explanation: "Trade the knight, damaging White's pawn structure." },
                { move: 'bxc3', white: true,  explanation: "White has a huge center but structural weaknesses." },
                { move: 'Bg7', white: false, explanation: "The bishop is a monster on the diagonal, staring right at d4 and the queenside!" },
            ],
            keyIdeas: [
                "Black WANTS White to build a big center — then attacks it!",
                "...c5 is the critical break to undermine d4",
                "The Bg7 on the long diagonal is Black's best piece",
                "White has space but Black has dynamic counterplay",
                "Exchange variation (4.cxd5) is the main battleground"
            ],
            commonTraps: [],
            counters: [
                { name: "Exchange (4.cxd5 Nxd5 5.e4)", description: "The main line. White builds the center, Black attacks it." },
                { name: "Russian System (4.Nf3 Bg7 5.Qb3)", description: "Attack b7 and d5 simultaneously. Black must play accurately." },
                { name: "Fianchetto (3.g3)", description: "White fianchettoes too, leading to quieter positional play." }
            ],
            playAs: 'b'
        },

        'english-opening': {
            name: "English Opening",
            eco: "A10-A39",
            icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
            category: "Other Openings",
            difficulty: "Intermediate",
            description: "A flexible, positional opening. White plays 1.c4, a 'Reversed Sicilian' approach. Avoids mainstream theory and leads to rich strategic positions. Popular among grandmasters.",
            mainLine: [
                { move: 'c4',  white: true,  explanation: "The English! Control d5 from the flank. White avoids the main e4/d4 theory." },
                { move: 'e5',  white: false, explanation: "Black takes the center. This is the Reversed Sicilian." },
                { move: 'Nc3', white: true,  explanation: "Develop and support d4 or e4 later." },
                { move: 'Nf6', white: false, explanation: "Develop naturally." },
                { move: 'g3',  white: true,  explanation: "Fianchetto the bishop. White will control the center from the flanks." },
                { move: 'Bb4', white: false, explanation: "Pin the knight and fight for control of e4." },
                { move: 'Bg2', white: true,  explanation: "The bishop aims at the center and queenside through the long diagonal." },
                { move: 'O-O', white: false, explanation: "Castle safely." },
            ],
            keyIdeas: [
                "Flexible — White can transpose into many openings (d4, Nf3, etc.)",
                "The fianchetto (g3, Bg2) controls the center from the side",
                "White often aims for d3, e4 eventually — but slowly and safely",
                "Black's ...d5 break is the key equalizing idea",
                "Great choice for players who want to avoid memorizing theory"
            ],
            commonTraps: [],
            counters: [
                { name: "Symmetrical (1...c5)", description: "Black mirrors! Leads to complex maneuvering positions." },
                { name: "...e5 (Reversed Sicilian)", description: "The most natural. Black gets a solid central pawn." },
                { name: "...Nf6 transpositions", description: "Can transpose into Indian defenses or other d4 openings." }
            ],
            playAs: 'w'
        },

        'reti-opening': {
            name: "Réti Opening",
            eco: "A04-A09",
            icon: "♘",
            category: "Other Openings",
            difficulty: "Intermediate",
            description: "Named after Richard Réti, the hypermodern pioneer. White controls the center with pieces (not pawns), creating flexible positions. Often transposes into other openings.",
            mainLine: [
                { move: 'Nf3', white: true,  explanation: "The Réti! Develop first, decide on the pawn structure later. Maximum flexibility." },
                { move: 'd5',  white: false, explanation: "Black takes the center." },
                { move: 'g3',  white: true,  explanation: "Prepare the fianchetto. The bishop will eye d5 from g2." },
                { move: 'Nf6', white: false, explanation: "Natural development." },
                { move: 'Bg2', white: true,  explanation: "Complete the fianchetto. The bishop is a sniper targeting d5." },
                { move: 'c6',  white: false, explanation: "Support d5 and prepare a solid structure." },
                { move: 'O-O', white: true,  explanation: "Castle quickly. White's position is flexible and safe." },
                { move: 'Bg4', white: false, explanation: "Pin the knight and develop." },
                { move: 'c4',  white: true,  explanation: "Now challenge d5! White strikes from the flank." },
                { move: 'e6',  white: false, explanation: "Support d5 but lock in the bishop." },
            ],
            keyIdeas: [
                "Hypermodern — control the center with pieces, not pawns",
                "The Bg2 is the star piece — a long-range sniper on the diagonal",
                "White's c4 challenge to d5 is the key plan",
                "Can transpose into Queen's Gambit, Catalan, English, etc.",
                "Extremely flexible — great for creative players"
            ],
            commonTraps: [],
            counters: [
                { name: "Central pawns (...d5, ...c5)", description: "Black takes the center aggressively. White undermines with c4." },
                { name: "King's Indian reversed", description: "Black plays ...g6, ...Bg7 — leading to symmetrical positions." }
            ],
            playAs: 'w'
        },

        'catalan-opening': {
            name: "Catalan Opening",
            eco: "E01-E09",
            icon: "🐉",
            category: "d4 Openings",
            difficulty: "Advanced",
            description: "A sophisticated positional opening combining the Queen's Gambit with a fianchettoed bishop. The Bg2 exerts enormous long-term pressure on the queenside. Used by Kramnik, Giri, and Ding.",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Queen's pawn." },
                { move: 'Nf6', white: false, explanation: "Indian setup." },
                { move: 'c4',  white: true,  explanation: "Grab space." },
                { move: 'e6',  white: false, explanation: "Prepare ...d5." },
                { move: 'g3',  white: true,  explanation: "The Catalan! White fianchettoes — combining Queen's Gambit pawn structure with long diagonal pressure." },
                { move: 'd5',  white: false, explanation: "Standard response. Black challenges the center." },
                { move: 'Bg2', white: true,  explanation: "The bishop eyes the entire queenside along the long diagonal. Devastating when the center opens." },
                { move: 'Be7', white: false, explanation: "Develop and prepare castling." },
                { move: 'Nf3', white: true,  explanation: "Natural development." },
                { move: 'O-O', white: false, explanation: "Castle safely." },
                { move: 'O-O', white: true,  explanation: "Both sides are castled. The strategic battle begins." },
                { move: 'dxc4', white: false, explanation: "The Open Catalan. Black takes the pawn — but White's Bg2 comes alive!" },
            ],
            keyIdeas: [
                "The Bg2 is a positional monster on the long diagonal",
                "If Black takes ...dxc4, the Bg2 x-rays through to a8",
                "White slowly builds pressure — this is a squeeze opening",
                "The c4 pawn is a gambit if taken — White gets compensation through Bg2 activity",
                "One of the most popular openings at the highest level"
            ],
            commonTraps: [],
            counters: [
                { name: "Open Catalan (...dxc4)", description: "Black takes the pawn. White's Bg2 becomes extremely powerful." },
                { name: "Closed Catalan (...c6)", description: "Black holds the center. Leads to slower, strategic play." }
            ],
            playAs: 'w'
        },

        'dutch-defense': {
            name: "Dutch Defense",
            eco: "A80-A99",
            icon: "🌷",
            category: "d4 Openings",
            difficulty: "Intermediate",
            description: "Black plays ...f5 to fight for the e4 square. An ambitious, unbalanced response to 1.d4. Can lead to kingside attacks (Stonewall) or sharp tactical play (Leningrad).",
            mainLine: [
                { move: 'd4',  white: true,  explanation: "Queen's pawn." },
                { move: 'f5',  white: false, explanation: "The Dutch! Black immediately fights for e4 and prepares a kingside attack." },
                { move: 'c4',  white: true,  explanation: "Grab queenside space." },
                { move: 'Nf6', white: false, explanation: "Develop and support e4 control." },
                { move: 'g3',  white: true,  explanation: "Fianchetto to challenge Black's control of e4." },
                { move: 'e6',  white: false, explanation: "Solid. Prepare ...Be7 or ...Bb4." },
                { move: 'Bg2', white: true,  explanation: "Complete the fianchetto." },
                { move: 'Be7', white: false, explanation: "Develop and prepare castling." },
                { move: 'Nf3', white: true,  explanation: "Natural development." },
                { move: 'O-O', white: false, explanation: "Castle and prepare ...d5 (Stonewall) or ...d6 (Classical)." },
            ],
            keyIdeas: [
                "Black controls e4 and aims for a kingside attack",
                "Stonewall setup: ...d5, ...c6, ...e6 — rock solid but the Bc8 is bad",
                "Leningrad setup: ...d6, ...g6, ...Bg7 — more dynamic, like a reversed King's Indian",
                "The weakened e5 and h5 squares are the strategic cost of ...f5",
                "Not as popular at the highest level but great for surprise value"
            ],
            commonTraps: [],
            counters: [
                { name: "Stonewall (...d5)", description: "Super solid pawn chain. Black attacks on the kingside but the Bc8 is permanently bad." },
                { name: "Leningrad (...g6, ...Bg7)", description: "The dynamic approach. Fianchetto and strike with ...e5 or ...d6." },
                { name: "Anti-Dutch (2.Bg5)", description: "White's tricky try — the bishop pins an invisible knight. Black must know the theory!" }
            ],
            playAs: 'b'
        },
    };

    /* ══════════════════════════════════════════════════════════════
       MIDGAME SCENARIO POOLS
       Each pool has a CONCEPT with MULTIPLE positions that are
       randomly selected, ensuring variety on every visit.
       ══════════════════════════════════════════════════════════════ */
    const MIDGAME_POOLS = {
        'pins': {
            title: "Exploiting Pins",
            icon: "📌",
            concept: "Pins",
            difficulty: "Beginner",
            description: "A pin restricts a piece from moving because it would expose a more valuable piece behind it. Learn to create and exploit pins for material gain.",
            positions: [
                {
                    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
                    playerColor: 'w',
                    objective: "Find the move that creates a powerful pin on the knight, threatening to win material.",
                    keyMoves: [{ move: 'Ng5', explanation: "Attack f7 — the weakest square. The knight on g5 creates direct pressure on the pinned f7 pawn, only defended by the king.", bestMove: true }],
                    lesson: "Pins are one of the most powerful tactical motifs. A piece is pinned when it cannot move without exposing a more valuable piece. Always look for pin opportunities — especially pinning knights to kings or queens.",
                },
                {
                    fen: "r2qkb1r/ppp2ppp/2n1bn2/3pp3/4P3/1B3N2/PPPP1PPP/RNBQ1RK1 w kq - 2 6",
                    playerColor: 'w',
                    objective: "White has a bishop on b3 eyeing f7. Find the move that exploits the pin on the e6 bishop.",
                    keyMoves: [{ move: 'd3', explanation: "d3 reinforces the e4 pawn and prepares Bg5, creating a pin on the f6 knight to the queen. Multiple pins create devastating pressure!", bestMove: true }],
                    lesson: "Layering multiple pins creates overwhelming pressure. When one piece is pinned, look for ways to attack it again — the pinned piece cannot flee!",
                },
                {
                    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5",
                    playerColor: 'w',
                    objective: "Find a way to create a pin that wins material or creates a strong positional advantage.",
                    keyMoves: [{ move: 'Bg5', explanation: "Bg5 pins the f6 knight to the queen! The knight is stuck and White can pile up pressure. If Black plays ...h6, Bh4 maintains the pin.", bestMove: true }],
                    lesson: "Bishops are natural pinning pieces — they excel when pinning knights to kings or queens along diagonals. An absolute pin (to the king) means the piece literally cannot move.",
                },
                {
                    fen: "r1bqkb1r/ppp2ppp/2np1n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 5",
                    playerColor: 'w',
                    objective: "Black has just played ...d6. Find the move that creates a deadly pin.",
                    keyMoves: [{ move: 'Bg5', explanation: "Bg5! The bishop pins the f6 knight to the queen. Combined with the Bc4 attacking f7, White has a crushing setup. The knight cannot move!", bestMove: true }],
                    lesson: "The classic double attack: Bc4 targets f7 while Bg5 pins the knight. Combined pressure on weak points is the essence of chess tactics.",
                },
            ],
            tips: [
                "Bishops are natural pinning pieces — they work best on long diagonals",
                "Rooks pin along files and ranks",
                "An absolute pin (to the king) means the piece literally cannot move",
                "A relative pin (to the queen) — the piece CAN move, but shouldn't",
                "Exploit pins by adding more attackers to the pinned piece"
            ]
        },
        'back-rank': {
            title: "Back Rank Attacks",
            icon: "🏰",
            concept: "Back Rank Mate",
            difficulty: "Beginner",
            description: "When the king is trapped behind its own pawns with no escape square, a rook or queen on the back rank delivers checkmate. Learn to recognize and execute this pattern.",
            positions: [
                {
                    fen: "6k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a rook on b1 and the black king is stuck behind its pawns. Find the checkmate!",
                    keyMoves: [{ move: 'Rb8', explanation: "Rb8# is checkmate! The black king has no escape — trapped behind its own f7, g7, h7 pawns. Classic back rank mate.", bestMove: true }],
                    lesson: "The back rank mate is one of the most common tactical patterns. Consider a safe escape square for your king when back-rank threats arise; first check whether a pawn move creates another weakness.",
                },
                {
                    fen: "2r3k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1",
                    playerColor: 'w',
                    objective: "Black's rook is on c8 but the back rank is still vulnerable. Find the checkmate!",
                    keyMoves: [{ move: 'Qf8+', explanation: "Qf8+! The rook is forced to capture Rxf8, and... wait, that blocks the back rank more! Actually Qf8+! is mate because the king can't escape and the rook on c8 can't cover f8.", bestMove: true }],
                    lesson: "Queens can deliver back rank mates too. Sometimes you sacrifice the queen to force a back rank pattern — always check if the enemy king has a luft!",
                },
                {
                    fen: "1k5r/ppp5/8/8/8/8/PPP3R1/1K6 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a rook on g2 and the black king is on b8 behind its pawns. Find a winning idea!",
                    keyMoves: [{ move: 'Rg8+', explanation: "Rg8+! The rook slides to the back rank with check. After ...Rxg8 there's no immediate win, but Rg8 itself forces Black to give up the rook or get mated. If the h8 rook wasn't there, it's checkmate!", bestMove: true }],
                    lesson: "Even when back rank mate isn't immediate, the THREAT of it is powerful. Use it to win material or force trades in your favor.",
                },
                {
                    fen: "3r2k1/5ppp/4p3/8/8/4P3/5PPP/2RR2K1 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have two rooks. Black has one rook defending. Find the back rank combination!",
                    keyMoves: [{ move: 'Rd8+', explanation: "Rd8+! Force the trade Rxd8, then Rxd8# is checkmate! When you have doubled rooks, one can sacrifice to clear the way for the other.", bestMove: true }],
                    lesson: "Doubled rooks on an open file are devastatingly powerful for back rank tactics. The first rook deflects or sacrifices, the second delivers the mate.",
                },
            ],
            tips: [
                "Always check: does your king have a 'luft' (escape square like h2)?",
                "Heavy pieces (rooks and queens) are the back rank attackers",
                "Deflection and decoy tactics often set up back rank mates",
                "A rook on the 7th rank is dangerous — it can slide to the back rank",
                "Doubled rooks magnify back rank threats — one deflects, one mates"
            ]
        },
        'forks': {
            title: "Forks & Double Attacks",
            icon: "🍴",
            concept: "Forks",
            difficulty: "Beginner",
            description: "A fork attacks two or more pieces at once. Knights are the best forking pieces because they can attack in all directions and can't be blocked!",
            positions: [
                {
                    fen: "r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5",
                    playerColor: 'w',
                    objective: "Find the knight fork that attacks multiple valuable pieces simultaneously.",
                    keyMoves: [{ move: 'Nd5', explanation: "Nd5! The knight forks — it attacks the bishop on e7 and threatens Nxf6+. If Black takes with ...Nxd5, then exd5 attacks the knight on c6. Multiple threats at once!", bestMove: true }],
                    lesson: "Knight forks are devastating because knights jump over pieces. Always scan for squares where your knight can attack multiple targets.",
                },
                {
                    fen: "r1bq1rk1/ppp2ppp/2nb1n2/3pp3/8/3P1NP1/PPP1PPBP/RNBQ1RK1 w - - 0 7",
                    playerColor: 'w',
                    objective: "Find the pawn fork! Pawns can fork too!",
                    keyMoves: [{ move: 'e4', explanation: "e4! This pawn move attacks BOTH the d5 pawn and threatens e5, forking the knight on f6 and bishop on d6. Pawns are underrated forking pieces!", bestMove: true }],
                    lesson: "Pawn forks are surprisingly powerful. An advanced pawn threatening two pieces simultaneously can win material — don't overlook them!",
                },
                {
                    fen: "r1bqr1k1/pppp1ppp/2n2n2/2b1p3/4P3/2NP4/PPP1NPPP/R1BQK2R w KQ - 5 6",
                    playerColor: 'w',
                    objective: "Find a move that creates a fork threat or double attack.",
                    keyMoves: [{ move: 'd4', explanation: "d4! Attack both the e5 pawn and the c5 bishop at once. This pawn fork forces Black to make a concession — they can't save both targets.", bestMove: true }],
                    lesson: "Double attacks don't have to be knight forks. Pawn advances, bishop moves, and queen moves can all create forks. The key: attack two undefended pieces!",
                },
                {
                    fen: "r3k2r/ppqbbppp/2n1pn2/2pp4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w kq - 0 9",
                    playerColor: 'w',
                    objective: "Find the tactical shot that creates a fork!",
                    keyMoves: [{ move: 'dxc5', explanation: "dxc5! After Black recaptures ...Bxc5, White plays Nb5! forking the queen on c7 and the a7 pawn (or threatening Nd6+). The knight reaches b5 with devastating effect.", bestMove: true }],
                    lesson: "Sometimes you need a preparatory move (capture, exchange, etc.) to set up the fork. Think two moves ahead — what happens after the recapture?",
                },
            ],
            tips: [
                "Knights fork best because they can't be blocked",
                "Look for undefended pieces that a knight can reach in one jump",
                "The 'family fork' (king, queen, and rook) wins major material",
                "Pawns can fork too! An advanced pawn attacking two pieces is powerful",
                "Sometimes you need a preparatory move to set up the fork"
            ]
        },
        'pawn-structure': {
            title: "Pawn Structure Mastery",
            icon: "🎯",
            concept: "Pawn Weakness",
            difficulty: "Intermediate",
            description: "Isolated, doubled, and backward pawns are permanent weaknesses. Learn to identify and target them to gain a lasting strategic advantage.",
            positions: [
                {
                    fen: "r4rk1/pp1b1ppp/2n1p3/3pP3/3P4/2PB1N2/PP3PPP/R3R1K1 w - - 0 15",
                    playerColor: 'w',
                    objective: "Black has an isolated pawn on d5. Plan how to blockade and attack it.",
                    keyMoves: [{ move: 'Bf5', explanation: "Put the bishop on an aggressive square targeting e6 and creating pressure. The d5 pawn is isolated — it can't be defended by another pawn!", bestMove: true }],
                    lesson: "An isolated pawn is a permanent weakness. The strategy: 1) Blockade the pawn, 2) Attack it with pieces, 3) Win it or create other weaknesses.",
                },
                {
                    fen: "r4rk1/pp3ppp/2p1pn2/3p4/3P1B2/2PB1N2/PP3PPP/R3R1K1 w - - 0 14",
                    playerColor: 'w',
                    objective: "Black has a backward pawn on e6 and a semi-open e-file. How do you exploit it?",
                    keyMoves: [{ move: 'Re1', explanation: "Re1! Target the backward e6 pawn. Rooks thrive on semi-open files attacking weak pawns. Black's e6 pawn can't advance safely.", bestMove: true }],
                    lesson: "A backward pawn is one that can't advance because the adjacent pawns have already pushed past it. Target it with rooks on the semi-open file!",
                },
                {
                    fen: "r1b2rk1/pp1pppbp/2n3p1/q7/2P1P3/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 10",
                    playerColor: 'w',
                    objective: "Black's queen is on a5 but the pawn structure is key. Find the best structural move.",
                    keyMoves: [{ move: 'd4', explanation: "d4! Establishing the ideal pawn center (c4+d4+e4). This gives White massive space advantage and restricts Black's pieces. Control the center, control the game!", bestMove: true }],
                    lesson: "A strong pawn center (c4+d4+e4 or similar) gives your pieces more room and restricts your opponent. Build and maintain pawn structure advantages!",
                },
            ],
            tips: [
                "Isolated pawns can't be defended by other pawns — only pieces",
                "Place a knight on the square in front of an isolated pawn (blockade)",
                "Doubled pawns are weak because they can't protect each other",
                "Backward pawns (can't safely advance) are targets for rook pressure",
                "Use your pawn majority on one side to create a passed pawn"
            ]
        },
        'piece-activity': {
            title: "Piece Activity & Coordination",
            icon: "⚡",
            concept: "Piece Activity",
            difficulty: "Intermediate",
            description: "A piece that's stuck defending or has no good squares is 'passive.' Learn to find ways to activate your worst piece — this often transforms the entire position.",
            positions: [
                {
                    fen: "r2q1rk1/1p2bppp/p1n1pn2/3pN3/3P1B2/2PBP3/PP3PPP/R2Q1RK1 w - - 0 12",
                    playerColor: 'w',
                    objective: "Your pieces are mostly well-placed, but can you find the key move to increase your activity and create threats?",
                    keyMoves: [{ move: 'Qh5', explanation: "Qh5! Bring the queen to an aggressive post. Now you're threatening Nxf7, Bxh7+, and the queen is in the attack. Improve your worst-placed piece!", bestMove: true }],
                    lesson: "Always ask: 'Which is my worst piece?' Then find a way to improve it. All pieces active > extra material but passive pieces.",
                },
                {
                    fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 0 9",
                    playerColor: 'w',
                    objective: "You're in a typical Dragon Sicilian position. Find the most active setup!",
                    keyMoves: [{ move: 'f3', explanation: "f3! Prepare the deadly g4-g5 pawn storm. In the Dragon Sicilian, White attacks on the kingside. f3 prepares g4, and the entire army coordinates toward the kingside attack.", bestMove: true }],
                    lesson: "Piece coordination means all your pieces work toward the same plan. In attacking positions, coordinate everything toward the enemy king.",
                },
                {
                    fen: "r4rk1/pbqn1ppp/1p2pn2/2pp4/3P1B2/1QN1PN2/PP2BPPP/R4RK1 w - - 0 12",
                    playerColor: 'w',
                    objective: "Find a way to improve the coordination of your pieces.",
                    keyMoves: [{ move: 'Rfd1', explanation: "Rfd1! Put the rook on the central d-file where it supports d4 and eyes the enemy queen. Rooks belong on open or semi-open files — this coordinates your entire army.", bestMove: true }],
                    lesson: "Rooks need open files to be effective. Place them on files where they can penetrate, support pawns, or target enemy weaknesses.",
                },
            ],
            tips: [
                "Ask: 'What is my worst piece?' — then improve it",
                "Rooks belong on open files or behind passed pawns",
                "Knights need outposts — stable squares in the enemy half",
                "Bishops need open diagonals — trade pawns to free them",
                "The queen should enter the attack last, not first",
                "Coordinate all your pieces toward one plan"
            ]
        },
        'sacrifice': {
            title: "Sacrificial Attacks",
            icon: "🎁",
            concept: "Sacrificial Attack",
            difficulty: "Advanced",
            description: "Sometimes giving up material leads to a devastating attack. Learn to recognize when a sacrifice is correct — and when it's just losing material!",
            positions: [
                {
                    fen: "r1bq1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
                    playerColor: 'w',
                    objective: "The classic Greek Gift sacrifice position. Sacrifice the bishop on h7 and chase the king!",
                    keyMoves: [{ move: 'Bxh7+', explanation: "The Greek Gift! Bxh7+! Black must take: Kxh7. Then Ng5+ — the knight and queen are ready to attack the exposed king.", bestMove: true }],
                    lesson: "The Greek Gift (Bxh7+) works when: 1) Your knight can jump to g5 with check, 2) Your queen can reach the h-file, 3) The opponent can't easily defend.",
                },
                {
                    fen: "r1bqr1k1/ppp2ppp/2nb1n2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 0 7",
                    playerColor: 'w',
                    objective: "Find the tactical shot that wins material through a temporary sacrifice.",
                    keyMoves: [{ move: 'Bxd5', explanation: "Bxd5! Capture the center pawn. After ...exd5, White plays exd5 attacking the knight on c6. If the knight moves, d6 forks the bishop and rook. A temporary sacrifice that wins material!", bestMove: true }],
                    lesson: "Not all sacrifices are flashy king attacks. Sometimes a 'sacrifice' is really a temporary material investment that wins it back with interest.",
                },
                {
                    fen: "r1b2rk1/2qnbppp/p2ppn2/1p4B1/3NP3/2N2Q2/PPP2PPP/R3RBK1 w - - 0 12",
                    playerColor: 'w',
                    objective: "This is a classic Sicilian position. Find the piece sacrifice that opens up Black's king!",
                    keyMoves: [{ move: 'Nd5', explanation: "Nd5! The knight sacrifice crashes through. After ...exd5 (forced, as the knight threatens Nxe7+ and Nxf6+), exd5 opens the e-file and the bishop on g5 pins everything. Devastating!", bestMove: true }],
                    lesson: "In Sicilian Dragon/Najdorf positions, the Nd5 sacrifice is thematic. It blows open the center and exposes the black king. Learn to recognize these patterns!",
                },
                {
                    fen: "r2q1rk1/ppp1bppp/3p1n2/3Pp1B1/2P1n3/2N5/PP2BPPP/R2QK2R w KQ - 0 10",
                    playerColor: 'w',
                    objective: "Find a positional sacrifice that gives long-term compensation.",
                    keyMoves: [{ move: 'Bxf6', explanation: "Bxf6! Trade the bishop for the knight. After ...Bxf6, White plays Qd2 or Qg4 with a massive attack on the weakened kingside. Sometimes piece trades ARE sacrifices — giving up the bishop pair for attacking chances.", bestMove: true }],
                    lesson: "Positional sacrifices trade material for positional advantages: weak squares, open files, attacking chances. Not as flashy but equally powerful!",
                },
            ],
            tips: [
                "Conditions for Bxh7+: Nf3, Bd3, queen can reach h5",
                "After Bxh7+ Kxh7 Ng5+, the king must go to g8, g6, or h6",
                "Kg8: Qh5 threatening Qh7# and Qxf7#",
                "Kg6: Qd3+ forces the king into a mating net",
                "Not all sacrifices need to lead to mate — winning material back with interest is great",
                "Always calculate concrete lines — don't sacrifice on intuition alone (yet!)"
            ]
        },
        'discovered-attacks': {
            title: "Discovered Attacks",
            icon: "💫",
            concept: "Discovered Attack",
            difficulty: "Intermediate",
            description: "A discovered attack occurs when one piece moves, uncovering an attack by another piece behind it. Discovered checks are especially powerful — the moving piece can do whatever it wants!",
            positions: [
                {
                    fen: "r1bqk2r/ppppbppp/2n2n2/4N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 6 5",
                    playerColor: 'w',
                    objective: "Your knight on e5 blocks the bishop on c4 from hitting f7. Find the discovered attack!",
                    keyMoves: [{ move: 'Nxf7', explanation: "Nxf7! A devastating discovered attack. The knight takes the f7 pawn, and simultaneously the bishop on c4 now has a clear diagonal. If Kxf7, the king is exposed. The bishop and knight coordinate perfectly!", bestMove: true }],
                    lesson: "Discovered attacks are like loaded springs — the front piece moves and BOOM, the rear piece fires. Especially deadly when the front piece can also capture or give check!",
                },
                {
                    fen: "rn1qkb1r/pb1p1ppp/1p2pn2/2pN4/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
                    playerColor: 'w',
                    objective: "Your knight on d5 blocks the bishop on c4. Move the knight with a threat to unleash the bishop!",
                    keyMoves: [{ move: 'Nxf6+', explanation: "Nxf6+! The knight captures with check, and the bishop on c4 is now x-raying down to f7 (or beyond). Black must deal with the check, giving White time. A classic discovered check pattern!", bestMove: true }],
                    lesson: "A discovered CHECK is the strongest form. The opponent MUST deal with the check, so the moving piece can capture anything it wants — even the queen!",
                },
            ],
            tips: [
                "Discovered attacks are like 'two moves in one' — the moving piece and the uncovered piece both attack",
                "Discovered CHECK is the strongest — opponent MUST deal with the check",
                "In a discovered check, the moving piece can take ANYTHING — even the queen",
                "Look for situations where your pieces are lined up on the same file, rank, or diagonal",
                "Even a pawn move can trigger a devastating discovered attack"
            ]
        },
        'deflection': {
            title: "Deflection & Decoy",
            icon: "🎭",
            concept: "Deflection",
            difficulty: "Intermediate",
            description: "A deflection forces an enemy piece away from its defensive duty, leaving something vulnerable. It's like luring a guard away from the treasure!",
            positions: [
                {
                    fen: "2r3k1/5pp1/4p2p/1p6/1P6/5P1P/4rPP1/R3R1K1 w - - 0 30",
                    playerColor: 'w',
                    objective: "Black's rook on e2 is dangerous, but it's also the only defender of the c8 rook. Find the deflection!",
                    keyMoves: [{ move: 'Ra8', explanation: "Ra8! The rook attacks the back rank, threatening Rxc8+. If the c8 rook moves, the e2 rook loses its defender. If the e2 rook goes to defend, then... Black is overwhelmed!", bestMove: true }],
                    lesson: "Deflection means forcing a piece away from an important job. If a piece is performing two duties at once (overloaded), you can exploit it!",
                },
                {
                    fen: "r1bq2k1/pp3ppp/2pb4/3n4/3P4/2PB1N2/PP3PPP/R1BQ2K1 w - - 0 14",
                    playerColor: 'w',
                    objective: "Black's knight on d5 is blocking the d-file. Find a way to deflect it!",
                    keyMoves: [{ move: 'c4', explanation: "c4! The pawn attacks the knight, forcing it to move and opening the d-file for your rook. The bishop on d3 also gains more scope. Deflection with a tempo!", bestMove: true }],
                    lesson: "Pawn pushes can deflect pieces from key squares. If a piece is holding a position together, find a way to force it away!",
                },
            ],
            tips: [
                "An overloaded piece is defending two things — attack one to win the other",
                "Sacrifices often deflect defenders — give up a piece to lure a defender away",
                "Decoys lure a piece TO a bad square; deflections push it AWAY from a good one",
                "Queens are often overloaded — defending multiple weak points simultaneously",
                "Check if removing a defender wins material — that's the deflection in action"
            ]
        },
    };

    /* ══════════════════════════════════════════════════════════════
       ENDGAME POSITION POOLS
       Each pool teaches a concept with MULTIPLE positions.
       ══════════════════════════════════════════════════════════════ */
    const ENDGAME_POOLS = {
        'king-pawn': {
            title: "King + Pawn Endgames",
            icon: "♟️",
            concept: "Opposition",
            difficulty: "Beginner",
            description: "The most fundamental endgame. Learn the 'opposition' — the key concept that determines if a single pawn can promote and win.",
            positions: [
                {
                    fen: "8/4k3/8/8/4PK2/8/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a king and pawn vs lone king. Advance your pawn to promote it! Use the opposition to force your way through.",
                    keyMoves: [{ move: 'Ke5', explanation: "First, advance the KING, not the pawn! The king must lead. Ke5 takes the opposition — Black's king must give way." }],
                    lesson: "The opposition means: kings face each other with one square between, and the side NOT to move has the advantage. To win K+P vs K: 1) Get your king IN FRONT of the pawn, 2) Use opposition.",
                },
                {
                    fen: "8/8/8/8/8/4k3/4P3/4K3 w - - 0 1",
                    playerColor: 'w',
                    objective: "Your pawn is on e2 and kings are close. Is this position a win or a draw?",
                    keyMoves: [{ move: 'Kf1', explanation: "Kf1! This is actually a draw — White cannot make progress because Black has the opposition. Any pawn push allows ...Ke4 blockading. This teaches you the limits of K+P vs K." }],
                    lesson: "In this position, the defending king can keep the pawn blocked with correct play. Opposition and key squares matter; a king in front of a pawn does not guarantee a draw in every position.",
                },
                {
                    fen: "4k3/8/8/4PK2/8/8/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Your pawn is on e5 and your king is beside it. Win this!",
                    keyMoves: [{ move: 'Ke6', explanation: "Ke6! The king reaches the sixth rank ahead of its pawn and takes the opposition. Support the pawn's advance with your king and check for stalemate before each move." }],
                    lesson: "In king-and-pawn endings, check key squares, opposition, and stalemate before pushing. Advancing the king first is often useful, but the exact position determines whether a pawn move wins or draws.",
                },
            ],
            tips: [
                "KING FIRST, pawn second — the king must lead the way",
                "Opposition: kings face each other, the one NOT to move has the advantage",
                "Rule of squares: draw a square from the pawn to the 8th rank. If the enemy king can step into it, they can catch the pawn",
                "Rook pawns (a/h file) are often draws because the king can hide in the corner",
                "Never push the pawn to the 6th rank unless it gives check"
            ]
        },
        'rook-endgames': {
            title: "Rook Endgame Essentials",
            icon: "♜",
            concept: "Rook Endgames",
            difficulty: "Intermediate",
            description: "Rook endgames are the most common endgame type. Master the Lucena and Philidor positions, and the principle that rook activity is king.",
            positions: [
                {
                    fen: "3R4/3P1k2/8/4K3/8/8/8/5r2 w - - 0 1",
                    playerColor: 'w',
                    objective: "The Lucena Position! Your pawn is on the 7th rank with your king in front. Use the 'bridge-building' technique to promote.",
                    keyMoves: [{ move: 'Rd4', explanation: "The bridge! Move the rook to the 4th rank. When Black's rook starts giving checks, you'll interpose your rook on e4 — blocking the checks and promoting the pawn." }],
                    lesson: "The Lucena Position: 1) Rook to the 4th rank (bridge), 2) King goes to the side, 3) Rook blocks checks. This always wins!",
                },
                {
                    fen: "8/4Rpk1/8/4PK2/8/8/8/3r4 b - - 0 1",
                    playerColor: 'b',
                    objective: "You're defending with rook vs rook+pawn. Use the Philidor technique to draw!",
                    keyMoves: [{ move: 'Rd6', explanation: "The Philidor! Keep the rook on the 6th rank. This prevents White's king from advancing. When the pawn pushes to e6, THEN retreat to Rd1 for checks from behind." }],
                    lesson: "Philidor Defense: 1) Rook on the 3rd rank (6th from White's view), 2) Wait for pawn to advance, 3) Retreat to back rank for checks from behind.",
                },
                {
                    fen: "8/R4pkp/6p1/2r5/8/6PP/5PK1/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Your rook on a7 is active on the 7th rank. Use it to create threats!",
                    keyMoves: [{ move: 'Rb7', explanation: "Keep the rook active on the 7th rank! Rb7 attacks the f7 pawn and keeps the king cut off. Active rooks are worth more than passive pawns." }],
                    lesson: "A rook on the 7th rank is a monster. In rook endgames, prioritize activity over material.",
                },
                {
                    fen: "8/1p3kp1/1P3p1p/5P2/4K3/7P/8/4r3 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a passed b6 pawn but no rook. Find the winning plan!",
                    keyMoves: [{ move: 'Kd5', explanation: "Kd5! March the king to support the b-pawn. The king escorts the passer to promotion while Black's rook is tied down to stopping it." }],
                    lesson: "In endgames, the king is a fighting piece. An active king supporting a passed pawn is often decisive.",
                },
            ],
            tips: [
                "The Lucena is THE most important rook endgame — learn it by heart",
                "Philidor: Rook on the 3rd rank, wait, then checks from behind",
                "A rook on the 7th rank is worth half a pawn in activity",
                "Cut off the enemy king with your rook — along a file or rank",
                "Activity > material in rook endgames",
                "Rooks behind passed pawns (yours or opponent's) are ideal"
            ]
        },
        'king-activity': {
            title: "King Centralization",
            icon: "♔",
            concept: "King Activity",
            difficulty: "Beginner",
            description: "In the endgame, the king transforms from a piece that needs protection to a powerful fighter. A centralized king controls more squares and supports pawn advances.",
            positions: [
                {
                    fen: "8/pp3pkp/4p1p1/3pP3/3P2P1/2P4P/PP6/6K1 w - - 0 1",
                    playerColor: 'w',
                    objective: "March your king to the center! In the endgame, the king is a strong piece.",
                    keyMoves: [{ move: 'Kf2', explanation: "Start the king march! Kf2 → Ke3 → Kd3/Kf4 — the king must join the fight." }],
                    lesson: "In the endgame, the king is worth about 4 pawns of fighting power! Centralize it immediately.",
                },
                {
                    fen: "8/p4kpp/1p2p3/2p1P3/2P5/1P4P1/P5KP/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Both sides have pawn structures. Your king is on g2 — activate it!",
                    keyMoves: [{ move: 'Kf3', explanation: "Kf3! Head toward the center and the weak spots. The king needs to reach d4 or e4 to dominate. Don't leave your king on the back rank in the endgame!" }],
                    lesson: "The fastest path to the center is often a diagonal. Don't go straight — use diagonal king marches to reach the action quickly.",
                },
                {
                    fen: "8/5k2/4p1p1/3pP1P1/2pP4/2P5/5K2/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Both kings need to become active. Get your king to the right place!",
                    keyMoves: [{ move: 'Ke3', explanation: "Ke3! Head straight for d4 — the ideal central square. From d4, your king supports the d-pawn, blocks Black's d-pawn, and controls critical squares." }],
                    lesson: "In pawn endgames, the king that reaches the key squares first usually wins. Calculate which squares your king needs to occupy, then march there as fast as possible!",
                },
            ],
            tips: [
                "In the endgame, activate your king IMMEDIATELY — don't leave it on g1",
                "The king walks on diagonals to reach the center fastest",
                "A centralized king is worth ~4 pawns of fighting value",
                "Support your pawn advances with the king — escort them to promotion",
                "Block enemy passed pawns with your king if no other piece can"
            ]
        },
        'passed-pawns': {
            title: "Passed Pawn Technique",
            icon: "🏃",
            concept: "Pawn Endgames",
            difficulty: "Intermediate",
            description: "A passed pawn is one with no enemy pawns blocking or guarding its path to promotion. Outside passed pawns are especially deadly as decoys in king+pawn endgames.",
            positions: [
                {
                    fen: "8/8/1p2k1p1/p3p1P1/P3P3/1P2K3/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have an outside passed pawn on the a-file. Use it as a decoy!",
                    keyMoves: [{ move: 'b4', explanation: "Prepare to create a passed pawn! After b4, axb4, a5 — you'll have an outside passed pawn that Black's king must chase, leaving the kingside undefended." }],
                    lesson: "The outside passed pawn wins because: 1) Push it → king must chase, 2) While their king is away, your king invades and wins pawns.",
                },
                {
                    fen: "8/5k2/8/1P3p2/5P2/4K3/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Your b5 pawn is passed. How do you use it?",
                    keyMoves: [{ move: 'b6', explanation: "b6! Push the passed pawn! Black's king must rush to stop it, leaving the f5 pawn undefended. Then your king takes on f5 and promotes your f-pawn too." }],
                    lesson: "A passed pawn is a THREAT that demands the opponent's attention. Even if you can't promote it, it ties down enemy pieces and creates weaknesses elsewhere.",
                },
                {
                    fen: "8/1p6/1P2k3/8/4K3/8/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a passed b6 pawn vs Black's b7. Find the winning technique!",
                    keyMoves: [{ move: 'Kd5', explanation: "Kd5! NOT b7?? which is stalemate after ...Kb7. Instead, bring the king to c6 to support the pawn properly. Kd5, ...Kd7, Kc5, ...Kc8, Kc6! and the pawn promotes." }],
                    lesson: "King first, pawn second! Pushing the pawn too early can lead to stalemate or drawing positions. Always support with the king.",
                },
            ],
            tips: [
                "An outside passed pawn acts as a decoy — luring the king away",
                "Push the passer → opponent's king chases → your king invades",
                "The further the passed pawn from other pawns, the stronger the decoy",
                "In king+pawn endgames, count tempi carefully — one move can decide everything",
                "Be careful of stalemate — don't push the pawn too early without king support!"
            ]
        },
        'bishop-endgames': {
            title: "Bishop Endgames",
            icon: "♗",
            concept: "Bishop Endgames",
            difficulty: "Intermediate",
            description: "Bishop endgames have unique characteristics. Same-color bishop endings can be very drawish, but opposite-color bishops create winning chances even down material!",
            positions: [
                {
                    fen: "8/8/4kp2/3p4/2pP4/2P2K2/4B3/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "You have a bishop vs Black's pawn majority. Find the right plan!",
                    keyMoves: [{ move: 'Ke3', explanation: "Ke3! Centralize the king first. Then the bishop blockades the c4 pawn while the king infiltrates. In bishop endgames, the king is crucial — it can attack pawns the bishop can't reach." }],
                    lesson: "In bishop endgames, place your pawns on the OPPOSITE color of your bishop. This gives your bishop more squares and your pawns more protection.",
                },
                {
                    fen: "8/5p2/4bk2/4p3/4P3/4BK2/5P2/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Opposite-color bishops! Is this position drawable or winning?",
                    keyMoves: [{ move: 'Kg4', explanation: "Kg4! In opposite-color bishop endgames, the attacker needs to create TWO threats on BOTH colors. Kg4 heads toward h5 or f5 to create kingside pressure. One weakness isn't enough — you need two!" }],
                    lesson: "Opposite-color bishops: the defender draws if they only need to guard ONE weakness. The attacker must create threats on BOTH sides of the board to win.",
                },
            ],
            tips: [
                "Place your pawns on the OPPOSITE color of your bishop",
                "Your bishop controls one color — your pawns should control the other",
                "Opposite-color bishops favor the attacker in middlegames (extra attacker that can't be traded)",
                "But in endgames, opposite-color bishops favor the defender (fortress drawing chances)",
                "The side with the bishop should keep pawns on both sides of the board"
            ]
        },
        'knight-endgames': {
            title: "Knight Endgames",
            icon: "♞",
            concept: "Knight Endgames",
            difficulty: "Intermediate",
            description: "Knight endgames are the most similar to king+pawn endgames. Knights are slow and struggle with passed pawns on opposite sides of the board.",
            positions: [
                {
                    fen: "8/5k2/2p5/1pN5/1P2K3/8/8/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Your knight vs Black's pawns. Use the knight to blockade and win!",
                    keyMoves: [{ move: 'Nd3', explanation: "Nd3! The knight blockades the b-pawn and controls c5, preventing ...c5. Knights are fantastic blockaders — they can block a pawn while still being active!" }],
                    lesson: "Knights make excellent blockaders. A knight on a blockading square controls surrounding squares while stopping the pawn. Bishops can blockade too, but knights do it better.",
                },
                {
                    fen: "8/8/4k3/8/2KN4/8/3p4/8 w - - 0 1",
                    playerColor: 'w',
                    objective: "Black has a dangerous passed pawn on d2! Can you stop it?",
                    keyMoves: [{ move: 'Nb3', explanation: "Nb3! The knight blocks the pawn and controls d2. From b3, the knight covers d2 AND c1, creating a perfect barrier. Then bring your king to mop up." }],
                    lesson: "Knights can stop passed pawns efficiently — a knight in front of a pawn controls both the queening square and the next square. But be careful: a knight can't lose a tempo (it takes an even number of moves to return to the same square).",
                },
            ],
            tips: [
                "Knight endgames are very similar to pawn endgames in character",
                "Knights are slow — they struggle against passed pawns far apart",
                "Knights can't lose a tempo — this matters in zugzwang positions",
                "A knight on the 5th rank is very strong — it controls 8 squares",
                "Knights are better than bishops in closed positions with pawns on both colors"
            ]
        },
    };

    /* ══════════════════════════════════════════════════════════════
       SCENARIO BUILDER — Creates randomized scenarios from pools
       ══════════════════════════════════════════════════════════════ */
    function buildMidgameScenarios() {
        return Object.entries(MIDGAME_POOLS).map(([id, pool]) => {
            // Pick a random position from the pool
            const pos = pool.positions[Math.floor(Math.random() * pool.positions.length)];
            return {
                id,
                title: pool.title,
                icon: pool.icon,
                concept: pool.concept,
                difficulty: pool.difficulty,
                description: pool.description,
                fen: pos.fen,
                playerColor: pos.playerColor,
                objective: pos.objective,
                keyMoves: pos.keyMoves,
                lesson: pos.lesson,
                tips: pool.tips,
                _poolSize: pool.positions.length,
            };
        });
    }

    function buildEndgamePositions() {
        return Object.entries(ENDGAME_POOLS).map(([id, pool]) => {
            const pos = pool.positions[Math.floor(Math.random() * pool.positions.length)];
            return {
                id,
                title: pool.title,
                icon: pool.icon,
                concept: pool.concept,
                difficulty: pool.difficulty,
                description: pool.description,
                fen: pos.fen,
                playerColor: pos.playerColor,
                objective: pos.objective,
                keyMoves: pos.keyMoves,
                lesson: pos.lesson,
                tips: pool.tips,
                _poolSize: pool.positions.length,
            };
        });
    }

    /* Force a new random scenario for a given pool */
    function getRandomFromPool(poolId, type) {
        const pools = type === 'midgame' ? MIDGAME_POOLS : ENDGAME_POOLS;
        const pool = pools[poolId];
        if (!pool) return null;
        const pos = pool.positions[Math.floor(Math.random() * pool.positions.length)];
        return {
            id: poolId,
            title: pool.title,
            icon: pool.icon,
            concept: pool.concept,
            difficulty: pool.difficulty,
            description: pool.description,
            fen: pos.fen,
            playerColor: pos.playerColor,
            objective: pos.objective,
            keyMoves: pos.keyMoves,
            lesson: pos.lesson,
            tips: pool.tips,
            _poolSize: pool.positions.length,
        };
    }

    /* ══════════════════════════════════════════════════════════════
       POST-OPENING STRATEGY DATABASE
       Positions where all pieces are developed and the middlegame begins.
       Answers: "What to do when every piece has been moved?"
       ══════════════════════════════════════════════════════════════ */
    const POST_OPENING_POSITIONS = {
        'italian-mid': {
            id: 'italian-mid',
            title: "Italian Game — Open Center",
            icon: "🇮🇹",
            opening: "Italian Game (Giuoco Piano)",
            fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 b - - 0 6",
            turn: 'b',
            description: "All pieces are developed! White and Black have knights and bishops active, kings castled, and rooks connected. This is the classic post-opening crossroads.",
            plans: [
                {
                    title: "Pawn Break in the Center (d4 / ...d5)",
                    badge: "primary",
                    icon: "⚔️",
                    explanation: "When pieces are developed, pawns dictate where lines open. White wants d4 to gain space and challenge e5. Black wants ...d5 to contest central dominance.",
                    steps: [
                        "Black can play ...d6 or ...d5 to anchor the center",
                        "White prepares d4 with c3 support",
                        "The player who controls the central pawn tension dictates the open files for rooks"
                    ]
                },
                {
                    title: "Knight Outpost Maneuver (Nbd2 -> Nf1 -> Ng3 -> Nf5)",
                    badge: "alternative",
                    icon: "♞",
                    explanation: "When centers are semi-closed, pieces need improved squares. The legendary knight maneuver brings the b1 knight to the devastating f5 outpost eyeing the enemy king.",
                    steps: [
                        "Knights love outposts on the 5th and 6th ranks",
                        "A knight on f5 cannot be kicked by ...g6 without fatally weakening the king's dark squares",
                        "Look for squares that enemy pawns cannot attack"
                    ]
                },
                {
                    title: "Rook Centralization (Re1 & ...Re8)",
                    badge: "alternative",
                    icon: "♜",
                    explanation: "Connect your rooks and place them opposite the enemy king or on half-open files. The e-file will open once central pawns trade.",
                    steps: [
                        "Place rooks on e1 and e8 to support central pawn pushes",
                        "Avoid keeping rooks idle on a1/h1 or a8/h8 after castling"
                    ]
                }
            ],
            diagnosis: {
                structure: "Open e-file / Symmetrical",
                pawnBreaks: "d4 for White, ...d5 for Black",
                openFiles: "e-file ready to open",
                bestOutposts: "f5 for White, d4 for Black",
                kingSafety: "Both kings castled and safe"
            },
            checklistTips: [
                "Pawns: Decide if you want to push d4/d5 or keep the tension",
                "Rooks: Slide to e1/d1 or e8/d8 before opening lines",
                "Bishops: Don't let your Italian bishop get locked in; keep the a2-g8 diagonal active"
            ]
        },

        'sicilian-mid': {
            id: 'sicilian-mid',
            title: "Sicilian Dragon — Opposite Castling",
            icon: "🐉",
            opening: "Sicilian Defense (Dragon Variation)",
            fen: "r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R b - - 2 9",
            turn: 'b',
            description: "Development is complete: White castled queenside, Black castled kingside. This is an all-out race between opposite-side attacks.",
            plans: [
                {
                    title: "Black's Queenside Infiltration (...Rc8 & ...a6-b5)",
                    badge: "primary",
                    icon: "🔥",
                    explanation: "Black uses the half-open c-file! The rook on c8 puts immense pressure on White's c2 pawn and c3 knight.",
                    steps: [
                        "Place rook on c8 immediately",
                        "Push ...a6 and ...b5 to roll pawns toward White's king",
                        "Look for the classic exchange sacrifice ...Rxc3! shattering White's pawn structure"
                    ]
                },
                {
                    title: "White's Yugoslav Kingside Storm (h4-h5 & Bh6)",
                    badge: "alternative",
                    icon: "⚡",
                    explanation: "White pushes the h-pawn to open the h-file, trades Black's key Dragon bishop with Bh6, and brings the queen and rooks in for checkmate.",
                    steps: [
                        "Bh6 eliminates the defensive g7 bishop",
                        "h4-h5 rips open the g6 pawn shield",
                        "Double heavy pieces on the h-file"
                    ]
                }
            ],
            diagnosis: {
                structure: "Asymmetrical / Half-open c-file",
                pawnBreaks: "h4-h5 for White, ...b5 / ...d5 for Black",
                openFiles: "c-file for Black, d-file for White",
                bestOutposts: "c4 / e5 for Black, d5 for White",
                kingSafety: "Opposite castling — Speed is everything!"
            },
            checklistTips: [
                "Speed rule: In opposite castling, every tempo matters. Don't make passive pawn moves",
                "Open files: Black owns the c-file; White aims for the h-file",
                "Piece coordination: Use the g7 bishop's long diagonal against White's b2 pawn"
            ]
        },

        'french-mid': {
            id: 'french-mid',
            title: "French Defense — Closed Pawn Chain",
            icon: "🇫🇷",
            opening: "French Defense (Advance)",
            fen: "r1b1k2r/ppq2ppp/2n1p3/2ppP3/3P4/2PB1N2/PP3PPP/R2QK2R w KQkq - 2 11",
            turn: 'w',
            description: "The center is locked with an e5 vs d5/e6 pawn chain. When the center is closed, you MUST attack on the flank where your pawns point!",
            plans: [
                {
                    title: "White's Kingside Attack (Pawn points to Kingside)",
                    badge: "primary",
                    icon: "👑",
                    explanation: "White's e5 pawn points toward the kingside and clamps down on f6. This grants White a natural kingside space advantage.",
                    steps: [
                        "Look for tactical sacrifices like Bxh7+ ('Greek Gift') if Black castles prematurely",
                        "Maneuver queen to g4 or h5",
                        "Push f4-f5 to open lines against Black's king"
                    ]
                },
                {
                    title: "Black's Attack on the Base of the Chain (...c4 & ...f6)",
                    badge: "alternative",
                    icon: "🎯",
                    explanation: "Nimzowitsch's Rule: Always attack a pawn chain at its base (d4) or head (e5). Black pressures d4 with ...Qb6 and ...cxd4, or undermines e5 with ...f6.",
                    steps: [
                        "Pile up on d4 with ...Qb6, ...Nc6, and ...cxd4",
                        "Break the head of the chain with ...f6",
                        "Liberate the 'bad' c8 bishop via ...Bd7-e8-h5"
                    ]
                }
            ],
            diagnosis: {
                structure: "Locked Center / e5 wedge",
                pawnBreaks: "f4-f5 for White, ...f6 / ...c4 for Black",
                openFiles: "c-file partially open",
                bestOutposts: "d4 for White, c4 / f5 for Black",
                kingSafety: "Black king uncastled; White king ready to castle"
            },
            checklistTips: [
                "Pawn Chain Rule: Attack the base of the chain (d4), not the strong points",
                "Bad piece: The light-squared c8 bishop is blocked by its own pawns. Find a way to trade or activate it",
                "Center locked? Attack on the flanks!"
            ]
        },

        'qgd-mid': {
            id: 'qgd-mid',
            title: "Queen's Gambit — Minority Attack",
            icon: "♕",
            opening: "Queen's Gambit Declined (Carlsbad)",
            fen: "r1bqr1k1/pp1n1ppp/2p1pn2/3p4/2PP4/2N2NP1/PP1QPPBP/R4RK1 w - - 0 10",
            turn: 'w',
            description: "The famous Carlsbad structure. All opening development is finished. How does White make progress when Black's position has no obvious flaws?",
            plans: [
                {
                    title: "The Minority Attack (b4-b5)",
                    badge: "primary",
                    icon: "🛡️",
                    explanation: "White uses 2 pawns (a and b) to attack Black's 3 pawns (a, b, and c). Once White pushes b5 and exchanges on c6, Black is left with a weak, backward c6 pawn on an open file!",
                    steps: [
                        "Prepare b4 with a4 or Rb1",
                        "Push b5 and trade bxc6",
                        "Use rooks on the open c-file to siege the isolated c6 pawn"
                    ]
                },
                {
                    title: "Black's Kingside Counter (...Ne4 & ...f5)",
                    badge: "alternative",
                    icon: "⚔️",
                    explanation: "Black cannot just defend passively on the queenside. Black plants a knight on e4, supports it with ...f5 (the Pillsbury setup), and swings heavy pieces to the kingside.",
                    steps: [
                        "Anchor knight on e4",
                        "Support with ...f5 and transfer rook ...Re6-h6",
                        "Attack White's king before White's queenside pressure bears fruit"
                    ]
                }
            ],
            diagnosis: {
                structure: "Carlsbad Pawn Structure",
                pawnBreaks: "b4-b5 (Minority Attack) for White, ...e5 for Black",
                openFiles: "c-file for White, e-file for Black",
                bestOutposts: "c5 for White, e4 for Black",
                kingSafety: "Both kings solidly castled"
            },
            checklistTips: [
                "Target weak pawns: A backward pawn on a half-open file is a permanent target",
                "Minority attack: Fewer pawns can defeat more pawns by creating structural weaknesses",
                "Counterplay: When opponent attacks on one wing, strike in the center or opposite wing"
            ]
        },

        'ruy-mid': {
            id: 'ruy-mid',
            title: "Ruy Lopez — Spanish Outpost Battle",
            icon: "🇪🇸",
            opening: "Ruy Lopez (Closed)",
            fen: "r1bqr1k1/1pp2ppp/p1np1n2/4p3/B3P3/3P1N2/PPP2PPP/RN1QR1K1 w - - 0 9",
            turn: 'w',
            description: "Opening moves are done. White's bishop sits on a4, Black has pushed ...a6 and castled. This position requires deep strategic patience.",
            plans: [
                {
                    title: "Central Control & Break with d4",
                    badge: "primary",
                    icon: "🏰",
                    explanation: "White plays c3 to prepare d4. This builds a dominant pawn center (pawns on d4 and e4) that restricts Black's minor pieces.",
                    steps: [
                        "Play c3 to protect d4 and give the bishop an escape square on c2",
                        "Push d4 at the right moment to open lines",
                        "Maintain the pin on the c6 knight as long as useful"
                    ]
                },
                {
                    title: "The Breyer / Chigorin Maneuver",
                    badge: "alternative",
                    icon: "🔄",
                    explanation: "Black's c6 knight is misplaced. The classic grandmaster idea is ...Nb8-d7, allowing ...c5 to fight for d4 while freeing the c-pawn!",
                    steps: [
                        "Reroute the knight to d7 or e7",
                        "Push ...c5 to claim space",
                        "Activate the bishop along the long diagonal"
                    ]
                }
            ],
            diagnosis: {
                structure: "Closed Center / Strategic Tension",
                pawnBreaks: "d4 for White, ...d5 / ...c5 for Black",
                openFiles: "Files will open after central exchange",
                bestOutposts: "d5 / f5 for White, d4 for Black",
                kingSafety: "Both kings castled; kingside pawns intact"
            },
            checklistTips: [
                "Don't rush exchanges: Keeping tension benefits the side with more space",
                "Re-routing pieces: If a piece has done its opening job, maneuver it to an attacking post",
                "Prophylaxis: Anticipate opponent pawn breaks before they happen"
            ]
        }
    };

    /* ══════════════════════════════════════════════════════════════
       ATTACK PATTERNS & PIECE SYNERGY DATABASE
       Teaches how pieces coordinate together into future attack plans.
       Answers: "Which piece needs what to create a winning attack?"
       ══════════════════════════════════════════════════════════════ */
    const ATTACK_PATTERNS = {
        'greek-gift': {
            id: 'greek-gift',
            title: "The Greek Gift Sacrifice (Bxh7+)",
            icon: "🎁",
            difficulty: "Intermediate",
            target: "Enemy King on g8 (Weak h7 square)",
            fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2PB1N2/PP1Q1PPP/R3K2R w KQ - 0 9",
            turn: 'w',
            pieceRoles: {
                queen: "Delivers the final blow. Needs to enter via h5 or g4 to threaten Qh7#.",
                knight: "The battering ram! Jumps to g5 with check to support the queen and cut off f7.",
                bishop: "The sacrifice piece on d3! Sacrifices itself on h7 to rip open the king's pawn shield.",
                rook: "Remains on the open file to cut off escape routes and prevent king flight.",
                pawns: "Pawn on e5 or central control kicks or pins the f6 defending knight."
            },
            sequence: [
                { move: 'Bxh7+', from: 'd3', to: 'h7', san: 'Bxh7+', annotation: "Sacrifice!", explanation: "The bishop shatters the king's defensive shield, forcing the king into the open.", target: 'h7' },
                { move: 'Kxh7', from: 'g8', to: 'h7', san: 'Kxh7', annotation: "Forced", explanation: "Black must capture the bishop, pulling the king onto the dangerous h-file.", target: 'h7' },
                { move: 'Ng5+', from: 'f3', to: 'g5', san: 'Ng5+', annotation: "Tempo Check!", explanation: "The knight springs in with check! This vacates f3 for the queen and attacks f7.", target: 'g5' },
                { move: 'Kg8', from: 'h7', to: 'g8', san: 'Kg8', annotation: "Retreat", explanation: "The king retreats, but now the path to h5 is wide open for White's queen.", target: 'g8' },
                { move: 'Qh5', from: 'd2', to: 'h5', san: 'Qh5', annotation: "Decisive Threat!", explanation: "The queen arrives on h5! Mate is threatened on h7 and cannot be stopped.", target: 'h5' },
                { move: 'Re8', from: 'f8', to: 'e8', san: 'Re8', annotation: "Flight square", explanation: "Black attempts to create an escape square for the king.", target: 'e8' },
                { move: 'Qxf7+', from: 'h5', to: 'f7', san: 'Qxf7+', annotation: "Crushing!", explanation: "White takes f7 with check, trapping the king.", target: 'f7' },
                { move: 'Kh8', from: 'g8', to: 'h8', san: 'Kh8', annotation: "Forced", explanation: "King must step into the corner.", target: 'h8' },
                { move: 'Qh5+', from: 'f7', to: 'h5', san: 'Qh5+', annotation: "Check", explanation: "White checks from h5, preparing Qh7# mate.", target: 'h5' },
                { move: 'Kg8', from: 'h8', to: 'g8', san: 'Kg8', annotation: "Forced", explanation: "King steps back to g8.", target: 'g8' },
                { move: 'Qh7#', from: 'h5', to: 'h7', san: 'Qh7#', annotation: "Checkmate!", explanation: "Checkmate! The knight on g5 defends the queen on h7. The attack pattern succeeded!", target: 'h7' }
            ],
            summary: "Pattern Checklist: 1. Bishop on d3/c4 aiming at h7. 2. Knight on f3 ready to jump to g5. 3. Queen ready to slide to h5. 4. Defending knight on f6 removed or absent."
        },
        'f5-outpost': {
            id: 'f5-outpost',
            title: "The f5 Knight Outpost Infiltration",
            icon: "⚡",
            difficulty: "Intermediate",
            target: "King on g8 & Dark Squares (g7/h7)",
            fen: "r1bq1rk1/1pp2ppp/p1np1n2/2b1p3/B3P3/2PP1N2/PP1N1PPP/R1BQR1K1 w - - 0 9",
            turn: 'w',
            pieceRoles: {
                queen: "Supports the f5 knight from d2 or c2, then swings to g4 or h5.",
                knight: "The star! Rerouted from d2 -> f1 -> g3 -> f5, creating immense pressure on g7.",
                bishop: "Pins the f6 defender from g5 or remains active on the a4-c2 diagonal.",
                rook: "Stationed on e1 to exert indirect pressure through the e-file.",
                pawns: "Pawn on d3/c3 anchors the center so pieces can maneuver safely."
            },
            sequence: [
                { move: 'Nf1', from: 'd2', to: 'f1', san: 'Nf1', annotation: "Step 1: Reroute", explanation: "The knight begins its maneuver toward the f5 outpost.", target: 'f1' },
                { move: 'Re8', from: 'f8', to: 'e8', san: 'Re8', annotation: "Developing", explanation: "Black centralizes the rook on the e-file.", target: 'e8' },
                { move: 'Ng3', from: 'f1', to: 'g3', san: 'Ng3', annotation: "Step 2: Approach", explanation: "The knight is now one square away from f5 and defends e4.", target: 'g3' },
                { move: 'h6', from: 'h7', to: 'h6', san: 'h6', annotation: "Weakening", explanation: "Black creates a slight hook on the kingside.", target: 'h6' },
                { move: 'Nf5', from: 'g3', to: 'f5', san: 'Nf5', annotation: "Step 3: The Outpost!", explanation: "The knight arrives on f5! It attacks g7, eyes h6, and cannot be kicked by ...g6 without ruining Black's king shield.", target: 'f5' }
            ],
            summary: "Pattern Checklist: 1. Identify an outpost square (f5/d5) that enemy pawns cannot attack. 2. Maneuver your knight through quiet squares (Nbd2-f1-g3-f5). 3. Bring queen to g4/h5."
        },
        'battery-assault': {
            id: 'battery-assault',
            title: "Queen + Bishop Battery Assault",
            icon: "🏹",
            difficulty: "Beginner",
            target: "H7 Checkmate Square",
            fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2N2NP1/PP1QPPBP/R4RK1 w - - 0 10",
            turn: 'w',
            pieceRoles: {
                queen: "Lines up behind the bishop on the b1-h7 or c1-h6 diagonal.",
                knight: "Eliminates or exchanges the f6 defending knight.",
                bishop: "Leads the charge along the diagonal pointing like a laser at the enemy king.",
                rook: "Controls the open c-file to prevent black counterplay.",
                pawns: "Pawn breaks open the diagonal for the queen and bishop."
            },
            sequence: [
                { move: 'Bg5', from: 'c1', to: 'g5', san: 'Bg5', annotation: "Pin Defender!", explanation: "The knight on f6 is the ONLY defender of h7. Pinning it neutralizes the defense.", target: 'g5' },
                { move: 'h6', from: 'h7', to: 'h6', san: 'h6', annotation: "Weakening", explanation: "Black tries to kick the bishop, but weakens g6.", target: 'h6' },
                { move: 'Bxf6', from: 'g5', to: 'f6', san: 'Bxf6', annotation: "Eliminate!", explanation: "White trades off the sole guardian of the kingside.", target: 'f6' },
                { move: 'Qxf6', from: 'd8', to: 'f6', san: 'Qxf6', annotation: "Recapture", explanation: "Black recaptures with the queen.", target: 'f6' },
                { move: 'Qc2', from: 'd2', to: 'c2', san: 'Qc2', annotation: "Form the Battery!", explanation: "Queen and bishop align on the c2-h7 diagonal, creating an unstoppable checkmate threat!", target: 'c2' }
            ],
            summary: "Pattern Checklist: 1. Identify what defends the target (the f6 knight). 2. Pin or eliminate that defender. 3. Align Queen + Bishop on the same diagonal to deliver mate."
        },
        'rook-lift': {
            id: 'rook-lift',
            title: "The 3rd-Rank Rook Lift (Re1 -> Re3 -> Rh3)",
            icon: "🌊",
            difficulty: "Intermediate",
            target: "H-file and King on g8",
            fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/3P4/2PBPN2/PP1Q1PPP/R3K2R w KQ - 0 9",
            turn: 'w',
            pieceRoles: {
                queen: "Stands on d2 or e2, clearing rank 1 and preparing to join on h6.",
                knight: "Controls e5 or jumps to g5 to support the h-file invasion.",
                bishop: "Aims at h7 from d3 to pin down Black's pieces.",
                rook: "The lifter! Advances to e3 on rank 3, then swings horizontally to g3 or h3.",
                pawns: "Pawn structure must allow the rook to slide along the 3rd rank."
            },
            sequence: [
                { move: 'Re1', from: 'h1', to: 'e1', san: 'Re1', annotation: "Mobilize", explanation: "Rook prepares to lift up the file.", target: 'e1' },
                { move: 'b6', from: 'b7', to: 'b6', san: 'b6', annotation: "Flank move", explanation: "Black slowly develops on the queenside, ignoring the kingside danger.", target: 'b6' },
                { move: 'Re3', from: 'e1', to: 'e3', san: 'Re3', annotation: "The Lift!", explanation: "The rook lifts to the 3rd rank! From e3, it can slide horizontally to g3 or h3.", target: 'e3' },
                { move: 'Bb7', from: 'c8', to: 'b7', san: 'Bb7', annotation: "Developing", explanation: "Black finishes queenside development.", target: 'b7' },
                { move: 'Rh3', from: 'e3', to: 'h3', san: 'Rh3', annotation: "Swing to the King!", explanation: "The rook swings to h3! Combined with the d3 bishop, Black's h7 pawn is completely overwhelmed.", target: 'h3' }
            ],
            summary: "Pattern Checklist: When the center is closed and files are blocked, use a rank (usually rank 3) to lift your rook vertically and swing it horizontally toward the opponent's king."
        }
    };

    /* ══════════════════════════════════════════════════════════════
       PUBLIC API
       ══════════════════════════════════════════════════════════════ */
    return {
        OPENINGS,
        MIDGAME_POOLS,
        ENDGAME_POOLS,
        POST_OPENING_POSITIONS,
        ATTACK_PATTERNS,

        getOpeningList() {
            return Object.entries(OPENINGS).map(([id, o]) => ({
                id, name: o.name, icon: o.icon, category: o.category,
                difficulty: o.difficulty, eco: o.eco, description: o.description, playAs: o.playAs
            }));
        },

        getOpening(id) { return OPENINGS[id] || null; },

        getPostOpeningList() {
            return Object.values(POST_OPENING_POSITIONS);
        },

        getPostOpening(id) {
            return POST_OPENING_POSITIONS[id] || null;
        },

        getAttackPatternList() {
            return Object.values(ATTACK_PATTERNS);
        },

        getAttackPattern(id) {
            return ATTACK_PATTERNS[id] || null;
        },

        getMidgameList() {
            return buildMidgameScenarios().map(s => ({
                id: s.id, title: s.title, icon: s.icon, concept: s.concept,
                difficulty: s.difficulty, description: s.description, poolSize: s._poolSize
            }));
        },

        getMidgame(id) {
            return getRandomFromPool(id, 'midgame');
        },

        getEndgameList() {
            return buildEndgamePositions().map(p => ({
                id: p.id, title: p.title, icon: p.icon, concept: p.concept,
                difficulty: p.difficulty, description: p.description, poolSize: p._poolSize
            }));
        },

        getEndgame(id) {
            return getRandomFromPool(id, 'endgame');
        },

        getCategories() {
            const cats = new Set();
            Object.values(OPENINGS).forEach(o => cats.add(o.category));
            return [...cats];
        },

        /** Get a specific position from a pool (by index) */
        getMidgamePosition(poolId, index) {
            const pool = MIDGAME_POOLS[poolId];
            if (!pool) return null;
            const pos = pool.positions[index % pool.positions.length];
            return { ...pos, title: pool.title, icon: pool.icon, concept: pool.concept, difficulty: pool.difficulty, description: pool.description, tips: pool.tips };
        },

        getEndgamePosition(poolId, index) {
            const pool = ENDGAME_POOLS[poolId];
            if (!pool) return null;
            const pos = pool.positions[index % pool.positions.length];
            return { ...pos, title: pool.title, icon: pool.icon, concept: pool.concept, difficulty: pool.difficulty, description: pool.description, tips: pool.tips };
        },
    };
})();
