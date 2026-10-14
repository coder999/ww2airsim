# Leyte campaign mission brainstorm

**Status:** brainstorming draft with foundational decisions resolved; not yet an
approved implementation plan
**Date:** 2026-10-12  
**Scope:** one American and one Japanese campaign set around Leyte, using different
sorties rather than replaying the same missions from opposite sides

This note turns the initial campaign discussion into concrete mission candidates.
Names, orders of battle, aircraft assignments, objective counts, and dates remain
open to revision. Historical claims should receive a final source pass before this
becomes a design spec.

## 1. Shared campaign principles

### 1.1 Two asymmetric stories

- The **American campaign** follows the invasion, the naval battle, the struggle
  to establish air power on Leyte, interdiction of Japanese reinforcements, and
  the defense of the Burauen airfields.
- The **Japanese campaign** follows the defense of the pre-invasion airfields,
  attacks on the landing force, protection of reinforcement routes, and an
  alternate-history version of the December counteroffensive that can drive the
  Americans from Leyte.
- The existing scenario set becomes the foundation of the repeatable
  **Non-Campaign Missions** available from campaign headquarters. These sorties
  bank player and pilot points but never advance the campaign chapter or change its
  canonical world state. The same content may remain available outside a campaign
  as **Single Missions** or **Training Grounds**, where it has no career effect.
- Campaign scenarios may reuse existing systems and arrangements, but should have
  campaign-specific dates, base states, briefings, radio traffic, and outcomes.

### 1.2 Historical honesty

Every campaign briefing should carry one of three labels:

- **Historical action:** closely follows a documented event, although geography
  and force sizes may be compressed for play.
- **Historical composite:** combines forces or incidents from the same operation
  into one representative sortie.
- **Alternate history:** starts from a stated point of divergence and does not
  claim that the resulting action occurred.

When the exact battle is fabricated, its historical note should explain the real
wartime role of the player's aircraft and the documented operations that inspired
the scenario.

### 1.3 Time to action

The player should reach meaningful action in **no more than 5–7 minutes at 1×
speed**, including a runway or water takeoff when the mission starts on the
surface. The preferred target is **2–4 minutes**.

"Action" means that the player is making a consequential decision: intercepting
an enemy, protecting a formation under threat, beginning a target approach,
searching the survivor area, or entering a surface engagement. A distant formation
on the horizon with nothing to do does not count.

Implementation implications:

- Design each start from a **time budget**, using the assigned aircraft's ordinary
  cruise speed, rather than placing it at a geographically convenient but tedious
  distance.
- Start west-coast missions airborne near the central ridge when a takeoff from an
  east-coast base would consume the whole allowance. The briefing can state that
  the uneventful outbound leg has already occurred.
- Stage historically out-of-bounds naval actions inside the playable world, as the
  existing mission design permits, and say so in the historical note.
- Keep recovery meaningful, but generally place the recovery field, carrier, safe
  egress boundary, or seaplane anchorage within another 5–7 minutes after the
  objective resolves.
- A future correctness check should calculate estimated cruise time from player
  start to the first action area and fail campaign content that exceeds the agreed
  cap.

### 1.4 Campaign completion and recovery

A campaign mission is completed only when both conditions succeed:

1. The primary objective is achieved.
2. The player satisfies the mission's authored recovery condition.

When the assigned carrier, runway, or seaplane anchorage is reasonably reachable
inside the playable world, the player must land there safely. When the historically
appropriate recovery base lies outside the world, crossing a designated friendly
egress boundary counts as recovery. Mission definitions must identify the exact
recovery target and may not substitute a convenient egress boundary for an
available in-world landing.

If the player is killed, captured, rescued after bailout, safely ditches, lands
without completing the objective, or otherwise reaches a normal debrief without
satisfying the primary objective and authored recovery, legitimately earned
destruction points are still banked and the outcome is recorded. The mission
grants no campaign badge, successful canonical world-state transition, chapter
unlock, roster bonus, difficulty bonus, or authored completion bonus, and remains
available to retry with an eligible living pilot. Explicitly quitting or
abandoning a sortie before its normal debrief instead forfeits all points earned
during that attempt.

### 1.5 Finale population and performance envelope

Each finale initially targets **24 total airborne aircraft, including the player,
plus 10 ships simultaneously present**. No more than 16 aircraft should occupy the
player's close combat area at once; the rest remain visible in distant formations,
approach or depart, or wait for an authored wave transition. Departed, landed, and
destroyed groups may be replaced by later waves without exceeding either
simultaneous cap.

The numbers are content targets, not a new engine-wide hard limit. Acceptance must
be measured in each completed finale at 2560 × 1440 on High using the reference
hardware. Both GPU p95 and live main-thread work p95 must remain within the 16.7 ms
60 FPS budget with cockpit rendering, clouds, terrain, AAA, ground vehicles, fires,
tracers, ship weapons, damage effects, and mission scripting active. A synthetic
swarm pass alone is insufficient. If the authored scene misses the budget, optimize
or restage it; do not silently lower visual settings or ship/aircraft counts without
a new design decision.

### 1.6 Initial campaign endpoint

Both initial six-chapter campaigns end with the 6–7 December Battle for the
Airfields / Operation Te-Go finale. Their victory scenes and epilogues summarize
what follows: the historical consolidation of the American position, or the
Japanese alternate-history isolation and evacuation of the American beachhead.
They do not add playable post-finale chapters.

Ormoc and Tanauan remain required canonical locations with their historically
appropriate construction, ownership, and damage states. In the initial campaign
they support scenery, objectives, briefings, and epilogue continuity rather than a
later playable chapter. A future expansion may continue either campaign beyond 7
December without changing the initial victory condition.

## 2. American campaign candidates

The six missions below deliberately alternate air defense, anti-shipping, ground
attack, rescue, escort, and a combined-arms finale.

### A1. Over the Beaches

**Date and label:** 20 October 1944 — historical composite  
**Player aircraft:** F6F Hellcat  
**Mission type:** dogfight / combat air patrol  
**Target time to action:** 3–4 minutes

**Where the player starts**

On the deck of *Essex*, staged roughly 12–15 miles east of the landing area. The
first Japanese raid is already reported inbound before launch, so takeoff and
climb are purposeful rather than empty transit.

**Mission objective**

Intercept the raid before it reaches the transports. The primary objective is to
keep a specified number of transports afloat through the attack window. Personal
kills are secondary. A damaged player may disengage once the raid breaks.

**Friendlies**

- USS *Essex*
- one Fletcher-class destroyer as carrier screen
- two friendly Hellcat wingmen
- Type B cargo ships standing in for invasion transports
- landing craft and a beach supply area, if those small craft/assets are built
- USS *Pennsylvania* or a Cleveland-class cruiser providing visible naval gunfire

**Enemies**

- G4M Betty and/or Ki-21 Sally bombers
- A6M2 Zero escorts
- optionally a small D3A Val element against the ships

**Where the player is supposed to end up**

Back aboard *Essex*. The carrier should remain within about 5 minutes of the combat
area after the raid turns away.

**Historical blurb**

American forces landed between Tacloban and Dulag on 20 October after preliminary
operations at the entrance to Leyte Gulf. The capture of the beachhead and nearby
airfields was central to the invasion plan, while carrier aircraft and naval guns
protected the transports and troops offshore. This mission is a compressed combat
air patrol representative of the air defense surrounding the landings, not a
reconstruction of one named interception. See the U.S. Marine Corps history,
[Western Pacific Operations](https://www.ibiblio.org/hyperwar/USMC/IV/USMC-IV-IV-2.html),
and the Naval History and Heritage Command's
[Leyte Gulf overview](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-038/h-038-2.html).

### A2. Taffy 3

**Date and label:** 25 October 1944 — historical action, geographically compressed  
**Player aircraft:** TBM-3 Avenger  
**Mission type:** bombing/torpedo attack inside a ship-to-ship engagement  
**Target time to action:** 2–3 minutes

**Where the player starts**

Airborne near a Casablanca-class escort carrier, 8–12 miles southeast of the
surface engagement. The player begins formed with two other Avengers and chooses a
bomb or torpedo load in the sortie form.

**Mission objective**

Attack a major Japanese warship while the escort carrier group attempts to escape.
The primary objective is to land one damaging hit on a cruiser or battleship and
keep the friendly escort carrier afloat. A secondary objective is to help disable
an attacking destroyer.

**Friendlies**

- one or two Casablanca-class escort carriers
- Fletcher-class destroyers standing in for the smaller destroyers and destroyer
  escorts of Taffy 3
- two AI Avengers
- a small Hellcat CAP

**Enemies**

- *Yamato*
- *Mogami*
- one or two Japanese destroyers
- shipboard antiaircraft fire; no invented Japanese fighter cover is required

**Where the player is supposed to end up**

On the surviving Casablanca-class carrier. It should turn away from the enemy and
remain 4–6 minutes from the player's strike position.

**Historical blurb**

Off Samar, Japanese battleships, cruisers, and destroyers surprised the lightly
armed escort carriers and escorts of Taffy 3. American destroyers attacked at close
range while carrier aircraft repeatedly bombed, strafed, and made torpedo runs,
often with whatever weapons remained available. The game stages a representative
portion of that much larger battle inside the Leyte world and uses available ship
classes as stand-ins. See the U.S. Army's
[Leyte campaign summary](https://www.ibiblio.org/hyperwar/USA/USA-C-Leyte/)
and the Naval History and Heritage Command's
[Leyte Gulf account](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-038/h-038-2.html).

### A3. The Long Column

**Date and label:** 3 November 1944 — historical action  
**Player aircraft:** P-38 Lightning  
**Mission type:** armored-column attack  
**Minimum pilot rank:** Lieutenant
**Target time to action:** 2–3 minutes

**Where the player starts**

Airborne west of Leyte's central ridge with one P-38 wingman. The briefing states
that the patrol has already crossed the island after failing to find shipping in
Ormoc Bay. Smoke or dust from the road reveals the unexpected target.

**Mission objective**

Disperse a long Japanese road column and destroy its tanks and critical supply
vehicles. The primary objective is a combined number of tanks and trucks stopped;
destroying the command vehicle, artillery, or road bridge is secondary. The player
is not expected to erase every vehicle.

**Friendlies**

- one P-38 wingman
- optionally a second element making one scripted pass before departing

**Enemies**

- moving Type 97 Chi-Ha tanks
- Type 95 Kurogane cars and future truck stand-ins
- artillery or cargo objects
- roadside light AAA and machine-gun positions
- vehicles that halt, scatter, or leave the road after the first pass

**Where the player is supposed to end up**

At Tacloban. The direct return across the island should take no more than about
6–7 minutes in the P-38; the debrief may trigger after a safe landing at either
Tacloban or Dulag if campaign play allows recovery alternatives.

**Historical blurb**

On 3 November, fifteen P-38s searching Ormoc Bay for Japanese shipping instead
found a road column reported as about ten miles long between Ormoc and Valencia.
The column included trucks, artillery, and tanks. The Lightnings strafed and
dispersed it under intense ground fire; two aircraft were lost, four returned on
one engine, and the surviving airplanes were heavily damaged. See the U.S. Army
history, [Leyte: The Return to the
Philippines](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-6.html).

### A4. Dumbo in the Gulf

**Date and label:** early November 1944 — historical composite  
**Player aircraft:** PBY-5A Catalina  
**Mission type:** air-sea rescue  
**Time of day:** night
**Minimum pilot rank:** Lieutenant (junior grade)
**Target time to action:** 5–6 minutes including water takeoff

**Where the player starts**

Afloat at the lighted San Pedro Bay seaplane anchorage. The aircraft taxis onto the
step, takes off, and flies 8–10 miles to the last reported position of a downed
crew. The search area is small enough that the player begins looking for a survivor
flare by the fifth minute.

**Mission objective**

Locate the survivors, land safely in their vicinity, taxi close, remain stopped
while they board, and return them to San Pedro Bay. A secondary objective rescues
an additional isolated survivor or photographs a reported Japanese vessel on the
way home.

**Friendlies**

- a raft and visible survivor group
- a rescue launch or PT boat moving toward the search area
- a seaplane tender or mooring area in San Pedro Bay
- optional friendly fighter cover that can be called but does not arrive instantly

**Enemies**

- weather and sea state
- floating debris and the risk of a poor water landing
- a small Japanese patrol or reconnaissance element arriving after pickup
- optional distant coastal AAA if the player searches too close to an enemy shore

**Where the player is supposed to end up**

Afloat inside the marked and lighted San Pedro Bay anchorage, engines stopped after
the rescue launch reaches the Catalina.

**Authored scoring exception**

Because this mission deliberately offers little opportunity for destruction
points, award 2,500 points to both the assigned pilot and human-player ledgers
only when the primary rescue and authored anchorage recovery both succeed. A
partial rescue, bailout, ditching, POW result, or failed return keeps any ordinary
destruction points but does not earn this completion bonus. Explicitly abandoning
the sortie forfeits both.

**Historical blurb**

This is a fabricated rescue built from documented Catalina work rather than one
identified pickup. The PBY served as a patrol bomber, reconnaissance aircraft,
transport, and "Dumbo" air-sea rescue aircraft. Leyte invasion planning provided
for PBY-5A courier service and coordinated reports and rescue measures for downed
aviators. Catalina units operating from Leyte Gulf also performed search, rescue,
evacuation, and patrol missions. See Task Force 77's
[Leyte operation plan, Annex G](https://www.ibiblio.org/hyperwar/USN/rep/Leyte/OpPlan/13-44-G.html)
and the U.S. Navy's
[patrol squadron histories](https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/dictionary-of-american-naval-aviation-squadrons-volume-2/pdfs/chap4-3.pdf).

### A5. Close the Ormoc Lifeline

**Date and label:** 11 November 1944 — historical composite  
**Player aircraft:** F6F Hellcat  
**Mission type:** bomber escort  
**Target time to action:** enemy interceptors in 2–3 minutes; convoy in 5–6

**Where the player starts**

Airborne alongside a formation of TBM Avengers already westbound toward Ormoc Bay.
The carrier launch and uneventful first part of the crossing have been skipped.

**Mission objective**

Keep at least three Avengers alive through their attack runs on the reinforcement
convoy. The player's score should favor bomber survival and successful drops over
leaving the formation to chase fighters. A secondary objective is to destroy one
Japanese escort ship after the bombers have released.

**Friendlies**

- four TBM Avengers with bombs or torpedoes
- one additional Hellcat wingman
- an Essex-class carrier staged within a playable recovery distance

**Enemies**

- A6M2 Zeros and/or Ki-43 Oscars attempting to break up the strike
- Type B Maru transports
- Kagero- or Shiratsuyu-class escorts
- shipboard AAA

**Where the player is supposed to end up**

Back aboard *Essex*. The scenario should compress the return leg so that the
carrier is 5–7 minutes from the convoy once the strike is complete.

**Historical blurb**

Japan repeatedly sent troops and supplies into Ormoc Bay after the invasion.
American land- and carrier-based aircraft attacked these reinforcement convoys.
On 11 November, aircraft from two Third Fleet task groups struck another convoy,
destroying most of its transports and escorts. This mission uses the existing
Hellcat and Avenger as a representative Navy fighter-and-strike package; it does
not claim that these exact aircraft flew this exact formation. See the Army Air
Forces history,
[The Pacific: Guadalcanal to Saipan](https://www.ibiblio.org/hyperwar/AAF/V/AAF-V-12.html),
and the Marine aviation account of
[air operations from Leyte](https://ibiblio.org/hyperwar/USMC/USMC-M-AvPhil/USMC-M-AvPhil-2.html).

### A6. Battle for the Airfields

**Date and label:** 6–7 December 1944 — historical action, compressed finale  
**Player aircraft:** P-38 Lightning with bombs  
**Mission type:** large bombing and dogfight finale  
**Target time to action:** 1–2 minutes

**Where the player starts**

At readiness on Tacloban's runway. An alarm sounds as the first Japanese formation
crosses the western hills. The player takes off directly into the interception;
friendly aircraft already airborne keep the runway start from becoming a delay.

**Mission objective**

The finale has linked phases rather than one enormous furball:

1. Intercept Japanese bombers and transports before they reach the Burauen fields.
2. Defeat their fighter escort while surviving aircraft continue toward the drop
   zones.
3. Bomb or strafe a Japanese lodgment, landed transport, or supply concentration
   near San Pablo and Bayug.
4. Protect an American relief formation and keep at least two Burauen strips in
   American hands.

**Friendlies**

- two or three P-38 elements arriving in waves
- American AAA at Tacloban, Bayug, Buri, and San Pablo according to field state
- M4 Sherman tanks, jeeps, trucks, and base personnel defending the fields
- an AI fighter-bomber element attacking the ground lodgment
- an American ten-ship support and transport group in Leyte Gulf/San Pedro Bay,
  with mission-relevant naval gunfire and AAA active

**Enemies**

- Ki-43 Oscars and A6M2 Zeros
- Ki-21 Sally and G4M Betty bombers
- Ki-57 transports introduced in J5, with no false bomber stand-in
- landed paratroop/supply objects and Type 97 tanks or cars advancing on the fields

**Where the player is supposed to end up**

At whichever of Tacloban, Bayug, or Buri remains serviceable. Tacloban is the safe
fallback; landing at a defended inland strip can be a secondary objective.

**Historical blurb**

On 6 December Japanese airborne troops descended on the Burauen airfields while
ground forces attacked from the mountains. They caused disruption and fought for
several days but failed to reverse the campaign. On 7 December American fighters
fought the last important air engagement over Leyte; the Fifth Air Force account
credits them with destroying 56 Japanese aircraft. The game compresses several
days of air and ground action into one finale. See the U.S. Army account of the
[Battle of the Airstrips](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-17.html)
and the Fifth Air Force
[campaign chronology](https://www.ibiblio.org/hyperwar/NHC/NewPDFs/USAAF/United%20States%20Strategic%20Bombing%20Survey/USSBS%20Fifth%20Air%20Force%20in%20the%20War%20Against%20Japan.pdf).

## 3. Japanese campaign candidates

This campaign is not the American list reversed. It begins with the defense of
Japanese facilities, moves through attacks on the invasion and protection of the
Ormoc supply route, and ends in an explicitly alternate Japanese victory.

### J1. Defend the Fields

**Date and label:** 18 October 1944 — historical composite  
**Player aircraft:** A6M2 Zero  
**Mission type:** dogfight / airfield defense  
**Target time to action:** 2–3 minutes

**Where the player starts**

On Buri's runway with the engine running. American carrier aircraft have been
reported over Leyte; the first fighter-bombers appear 4–6 miles east as the player
takes off.

**Mission objective**

Protect Buri's fuel, radio station, and serviceable aircraft from the carrier
strike. The primary objective is survival of specified ground assets, not a kill
quota. A secondary objective is to save a damaged Japanese bomber trying to land.

**Friendlies**

- one Zero wingman
- a small Ki-43 Oscar element joining after takeoff
- parked Japanese aircraft, AAA, and airfield personnel/vehicles at Buri

**Enemies**

- F6F Hellcats carrying bombs and rockets
- TBM Avengers attacking larger field installations

**Where the player is supposed to end up**

Back at Buri. If its runway is cratered, Bayug is the 3–4 minute alternate.

**Historical blurb**

American carrier aircraft struck airfields on and around Leyte before the 20
October landings. Buri was the most important of the inland fields near Burauen;
Dulag, Bayug, and San Pablo formed the rest of the southern airfield group. This
mission combines those preliminary strikes into a playable defense of Buri rather
than claiming one documented fighter engagement. See the U.S. Army description of
the [Leyte airfields](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-8.html)
and the Naval History and Heritage Command's
[invasion chronology](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-038/h-038-2.html).

### J2. Break the Landing

**Date and label:** 20 October 1944 — historical composite  
**Player aircraft:** B5N2 Kate with torpedo or bombs  
**Mission type:** anti-shipping strike  
**Target time to action:** fighter interception in 2–3 minutes; ships in 5–6

**Where the player starts**

Airborne southeast of Leyte Gulf with two Kates, two Vals, and a small Zero escort.
The long flight from a Japanese base outside the playable world has already taken
place.

**Mission objective**

Break through the combat air patrol and damage an invasion transport or major
escort. The formation should divide targets: Kates attack shipping, Vals attack
the naval screen, and the player chooses a safe approach through intense AAA.

**Friendlies**

- two B5N2 Kates
- two D3A Vals
- two A6M2 Zeros

**Enemies**

- Type B cargo ships standing in for invasion transports
- Fletcher-class destroyer and Cleveland-class cruiser escorts
- F6F Hellcat CAP
- naval and shore-based AAA

**Where the player is supposed to end up**

At a safe southern or western egress boundary 3–5 minutes after weapon release.
The Japanese launch base lies outside the world, so the mission should not require
an implausible landing on a captured Leyte strip.

**Historical blurb**

This is a representative Japanese attack on the invasion fleet, not a recreation
of one identified formation. The B5N was the Imperial Japanese Navy's principal
carrier torpedo bomber at the start of the Pacific War and could also carry bombs.
By Leyte it was increasingly vulnerable, but Japanese naval and army aircraft
continued to attack American shipping around the beachhead. The mission uses the
Kate, Val, and Zero to show the specialized torpedo, dive-bombing, and escort roles
of a Japanese strike package. The broader invasion setting is described in Task
Force 77's [Leyte operation plan](https://www.ibiblio.org/hyperwar/USN/rep/Leyte/OpPlan/index.html).

### J3. Road to Burauen

**Date and label:** late October 1944 — historical composite  
**Player aircraft:** Ki-43 Oscar  
**Mission type:** armored-column defense  
**Target time to action:** 2–3 minutes

**Where the player starts**

Airborne over a Japanese road column approaching the Burauen airfields. American
fighters are reported crossing the hills. The convoy is already moving and the
player begins in a useful defensive orbit, not at a distant base.

**Mission objective**

Keep the column's tanks and supply vehicles alive until they reach a dispersal area
near Buri. Intercept low-flying P-38s, call out attacks through radio messages, and
avoid being pulled away by high cover. A secondary objective saves the command
vehicle and all tanks.

**Friendlies**

- Type 97 Chi-Ha tanks
- cars, trucks, and artillery/supply objects
- one Ki-43 wingman
- roadside Japanese AAA near the destination

**Enemies**

- P-38 Lightnings making strafing and bombing passes
- an optional high-cover P-38 element that punishes careless pursuit

**Where the player is supposed to end up**

At Bayug or Buri after the column reaches cover. Both fields should be within
3–5 minutes of the defended road segment.

**Historical blurb**

This particular fighter defense is fabricated. Japanese forces did move men,
artillery, supplies, and armor through Leyte Valley, while American aircraft
attacked road traffic and documented a large Ormoc–Valencia column on 3 November.
The Ki-43 was an Imperial Japanese Army fighter valued for maneuverability but
lightly armed and increasingly outclassed by newer American aircraft. Placing an
Oscar over a vulnerable road column creates a plausible Army-air-defense mission
without pretending it is a recorded engagement. Background: U.S. Army,
[Leyte: The Return to the
Philippines](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-6.html).

### J4. Destroyers in the Bay

**Date and label:** early December 1944 — historical composite  
**Player aircraft:** B5N2 Kate with torpedo  
**Mission type:** torpedo attack inside a ship-to-ship engagement  
**Time of day:** night
**Minimum pilot rank:** Kaigun Chūi
**Target time to action:** less than 2 minutes

**Where the player starts**

Airborne west of Ormoc Bay as Japanese destroyers engage an American destroyer
group. The gun battle is visible through gun flashes, tracers, burning ships, and a
timed illumination flare; the player begins far enough out to set up one deliberate
torpedo run.

**Mission objective**

Disable or sink an American destroyer before it destroys the Japanese transport
and escort force. A secondary objective is to survive the torpedo run and spot the
damaged target for the Japanese surface ships.

**Friendlies**

- Kagero- and Shiratsuyu-class destroyers
- one Type B Maru attempting to escape
- one Zero providing limited high cover

**Enemies**

- two Fletcher-class destroyers
- a Cleveland-class cruiser, if balance and historical framing permit
- intense shipboard AAA
- one or two American fighters arriving late rather than masking the surface battle

**Where the player is supposed to end up**

At the western egress boundary 3–4 minutes after the attack. A damaged Kate may
ditch near the surviving Japanese ships and still complete the mission without a
landing badge.

**Historical blurb**

This is a fabricated air attack placed inside a composite of the destroyer actions
around Ormoc Bay. American and Japanese destroyers fought there while both sides
attempted to move or prevent reinforcements. The B5N Kate had been designed for
carrier torpedo and level-bombing work and had achieved major successes earlier in
the war, but by late 1944 its low speed and limited protection made a torpedo run
against modern fighters and antiaircraft fire exceptionally dangerous. The mission
combines that aircraft's real role with the documented Ormoc naval campaign rather
than asserting one particular Kate attack. Background: U.S. Army,
[Leyte campaign summary](https://www.ibiblio.org/hyperwar/USA/USA-C-Leyte/).

### J5. Night Drop on Burauen

**Date and label:** 6 December 1944 — historical composite
**Player aircraft:** Mitsubishi Ki-57 "Topsy"
**Mission type:** night paratrooper transport and drop
**Time of day:** night
**Minimum pilot rank:** Kaigun Taii
**Target time to action:** fighter interception in 2–3 minutes; drop zone in 5–6

**Where the player starts**

Airborne west of Leyte's central ridge with two additional Ki-57 transports and a
small Ki-43/A6M escort. The long flight from a Japanese base outside the playable
world has already occurred. Fires and signal flares beyond the ridge identify the
Burauen airfield complex while American fighters climb to intercept.

**Mission objective**

Lead the transport formation through the interception and deliver the paratroopers
into the marked corridor between San Pablo and Buri. A valid drop requires the
player to hold the authored altitude, speed, heading, and drop window long enough
for the troops to clear the aircraft. The primary objective succeeds when the
player and at least one other transport complete effective drops. A secondary
objective preserves all three transports or places a supply bundle inside a second
marked landing zone.

**Friendlies**

- two AI Ki-57 transports carrying additional paratroopers and supplies
- one Ki-43 Oscar and one A6M2 Zero escort element
- Japanese ground forces west of the fields providing signal fires or flares
- parachuting troops, supply bundles, and landed squad groups after release

**Enemies**

- P-38 Lightnings attempting to break up the transport formation
- American AAA around San Pablo, Buri, and Bayug
- searchlights, runway lighting, tracers, and fires that reveal both danger and the
  drop corridor
- American vehicles and base defenses visible around the intended landing zones

**Where the player is supposed to end up**

At a western safe-egress boundary 3–5 minutes after the drop. The launch base is
outside the playable world, so mission credit does not require an invented Japanese
landing field. A successful drop creates the initial Japanese lodgment inherited by
J6; it does not by itself capture the airfields.

**Historical blurb**

On 6 December Japanese airborne troops attacked the Burauen airfields as ground
forces advanced from the mountains. The raiders caused serious disruption but did
not hold the fields or reverse the Leyte campaign. The Ki-57 was a Japanese Army
transport used to carry personnel, cargo, and paratroopers; this historical
composite uses it as a representative transport rather than claiming an exact
tail-number reconstruction of one drop formation. The successful foothold carried
into J6 is the campaign's point of divergence from the historical failure. See the
U.S. Army account of the
[Battle of the Airstrips](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-17.html).

### J6. Operation Te-Go

**Date and label:** 6–7 December 1944 — alternate-history finale  
**Player aircraft:** Ki-43 Oscar or A6M2 Zero with a bomb  
**Mission type:** large bombing, escort, and dogfight finale  
**Time of day:** dawn following the J5 night drop
**Minimum pilot rank:** Kaigun Taisa
**Target time to action:** 2–3 minutes

**Where the player starts**

Airborne west of the Burauen fields beside a follow-on bomber and transport wave.
Fires and the J5 paratrooper lodgment identify the target area. The player is close
enough to see the battle but still has time to choose between protecting the
formation and suppressing American fighters.

**Mission objective**

The finale unfolds in waves:

1. Reinforce the J5 lodgment by escorting bombers and follow-on transports to Bayug,
   Buri, and San Pablo.
2. Bomb Tacloban or suppress AAA and parked fighters at the inland fields.
3. Defeat the American P-38 response while Japanese airborne troops secure the
   strips.
4. Protect a second strike against fuel, radio, and ammunition facilities.
5. Keep the captured fields operational until a reinforcement convoy reports that
   it has reached Ormoc.

Success is the campaign's explicit point of divergence: the Japanese retain the
Burauen fields, Tacloban and Dulag become unusable, the Ormoc lifeline remains open,
and the American beachhead is eventually evacuated.

**Friendlies**

- Ki-21 Sally and G4M Betty bombers
- A6M2 Zero and Ki-43 Oscar escorts arriving in separate waves
- surviving J5 Ki-57s and follow-on Japanese transport aircraft
- landed airborne troops, Type 97 tanks, cars, and supply objects
- Japanese AAA activated at captured fields during the final phase

**Enemies**

- multiple P-38 elements, introduced in waves rather than one giant furball
- American AAA at each operational field
- parked American aircraft, fuel, ammunition, and radio facilities
- M4 Sherman tanks and support vehicles counterattacking near the strips
- an American ten-ship support and transport group off Tacloban and the beachhead,
  contributing visible naval gunfire and AAA

**Where the player is supposed to end up**

At captured Buri or Bayug. Landing there visibly confirms the alternate outcome;
if both runways remain damaged, a marked Japanese-held road strip can be the final
fallback.

**Historical blurb**

The historical Japanese operation sent airborne troops against the Burauen fields
while ground forces advanced from the mountains and air attacks attempted to
neutralize American bases. The attackers caused damage and disruption but did not
stop the Leyte operation. This finale begins from that real plan and then diverges:
effective air coordination lets the Japanese hold the fields and isolate the
beachhead. The briefing and victory debrief must say plainly that this result is
alternate history. See the U.S. Army account of the
[Battle of the Airstrips](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-17.html).

## 4. Canonical campaign locations

Base geometry and building placement should be authored once per location. A
scenario may change ownership, national markings, parked aircraft, construction,
readiness, and accumulated damage, but surviving buildings must not move between
missions.

### 4.1 Historical state sequence

| Date/state | Tacloban | Dulag | Buri | Bayug | San Pablo | Tanauan |
| --- | --- | --- | --- | --- | --- | --- |
| 18–19 Oct | Japanese operational field | Japanese-held but unserviceable/rough | principal inland Japanese field | Japanese dry-weather strip | overgrown and largely unused | no field |
| 20–24 Oct | captured and under reconstruction | captured 21 Oct; not operational | captured after inland fighting | captured after inland fighting | captured, still poor | no field |
| Late Oct–Nov | increasingly active American base | construction/mud; usable only later | intermittent dry-weather work | intermittent dry-weather operations | construction, then abandoned 23 Nov | site selected late Nov |
| 6–7 Dec | American operational base and Japanese target | American field/support site | attacked in Battle of the Airstrips | attacked in Battle of the Airstrips | principal airborne drop area | visibly under construction |
| Japanese alternate ending | bomb-damaged/unusable | bomb-damaged/unusable | Japanese-controlled | Japanese-controlled | Japanese-controlled | construction interrupted |

The dates and exact readiness labels need a final source reconciliation. Useful
starting references are the U.S. Army chapters on the
[southern airfields](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-8.html),
[airfield construction](https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-11.html),
and the Marine account of
[Leyte aviation](https://ibiblio.org/hyperwar/USMC/USMC-M-AvPhil/USMC-M-AvPhil-2.html).

### 4.2 Required bases and persistent sites

#### Tacloban airfield — expand existing base

Campaign role: primary American air base, early Japanese target, American finale
start, and Japanese finale target.

Persistent functional buildings/areas:

- three or four hangars
- control tower
- radio/radar station
- fuel tank farm
- ammunition bunker area
- barracks and operations huts
- two or three AAA positions
- multiple aircraft revetments and dispersal bays
- coral/steel-mat apron and taxi connections
- drainage works and an engineer/construction area

#### Dulag airfield — expand existing base

Campaign role: captured field, muddy construction story, alternate recovery field,
and Japanese strike target.

Persistent functional buildings/areas:

- two hangars or large maintenance shelters
- small control/operations tower
- radio hut
- fuel and ammunition areas
- one or two AAA positions
- barracks/tent area
- revetments and dispersed parking
- visibly poor drainage, mud, construction matting, and service-road clutter

#### Buri airfield — new base

Campaign role: Japanese opening base, major Burauen field, armored-column
destination, and finale objective.

Persistent functional buildings/areas:

- two or three hangars
- control tower
- radio station
- fuel farm and ammunition bunker
- two AAA positions
- barracks and operations huts
- Japanese-style revetments and dispersed aircraft positions
- road connection toward Burauen

#### Bayug airfield — expand existing base

Campaign role: Buri alternate, dry-weather operational strip, armored-column
destination, and finale objective/recovery field.

Persistent functional buildings/areas:

- one or two maintenance shelters/hangars
- small operations tower
- radio hut
- one fuel and ammunition area
- one or two AAA positions
- revetments, tents, and rough dispersal parking
- muddy access road and unstable/temporary runway treatment

#### San Pablo airfield — new base

Campaign role: overgrown strip, failed construction site, principal paratroop/drop
area in the finale.

Persistent functional buildings/areas:

- minimal operations huts rather than a full permanent base
- abandoned construction camp
- one ammunition/supply area
- temporary AAA after American occupation
- overgrowth, standing water, unused equipment, and incomplete matting
- open drop-zone space around the runway

#### Tanauan construction site — new late-campaign site

Campaign role: visual evidence that the Americans are replacing the failed inland
fields. It need not be usable before a later campaign extension.

Persistent functional buildings/areas:

- graded coastal runway
- steel matting under construction
- engineer tents and supply stacks
- fuel and operations areas in early construction
- trucks, rollers, bulldozers, and drainage work
- no fully mature hangar complex during the current campaign dates

#### San Pedro Bay seaplane anchorage — new persistent water base

Campaign role: Catalina start and recovery location.

Persistent objects/areas:

- marked mooring area and buoys
- pier or pontoon
- fuel store and warehouse ashore
- operations/radio hut
- seaplane tender or anchored support vessel
- rescue launch and maintenance barges

#### Ormoc port and logistics area — new persistent non-airfield site

Campaign role: reinforcement-convoy destination, road-column origin, escort target,
and nearby destroyer actions.

Persistent buildings/areas:

- pier and warehouses
- fuel and ammunition stores
- vehicle marshalling/staging area
- road connection toward Valencia and Burauen
- shore AAA and optional coastal gun battery
- damaged and intact states that carry between later campaign missions

#### Landing beaches and beachhead — new persistent non-airfield site

Campaign role: American opening mission and background to the campaign's changing
front.

Persistent objects/areas:

- beach exits and supply dumps
- tents, trucks, crates, and engineering equipment
- landing-craft approach lanes
- naval gunfire target areas inland
- increasing American density after 20 October

### 4.3 Building and scenery asset inventory

The renderer/content library already has these useful building types:

- hangar
- tower
- AAA emplacement
- ammunition bunker
- barracks and huts
- fuel tank farm
- radio/radar station
- revetment
- pier and warehouses
- coastal gun battery

The campaign needs additional low-cost scenery pieces or treatments so the fields
do not look like a few isolated target buildings:

- pierced-steel-plank or Marston-mat runway/apron sections
- drainage ditches, culverts, standing water, and mud variants
- tents, sandbags, blast walls, and foxholes
- parked trucks, tankers, jeeps/cars, tractors, rollers, and bulldozers
- fuel drums, crates, bomb carts, maintenance stands, and canvas stores
- parked-aircraft dispersal arrangements
- runway craters, temporary repairs, burned pads, and debris states
- national flags, windsocks, identification panels, and side-specific clutter
- survivor raft, rescue flare/dye, mooring buoys, and rescue-launch assets for the
  Catalina mission

For performance and damage bookkeeping, each major base should have only a modest
number of strategically destructible structures—roughly 6–12 depending on its
importance—surrounded by batched or instanced decorative clutter. Destroying a
functional fuel farm or radio station matters; every tent and crate does not need
individual hit points.

## 5. Enabling content and mission reconciliation

Before implementation, reconcile the six-versus-six candidate list into exact
mission definitions. For each chapter, freeze the date and historical label,
player aircraft and minimum pilot rank, start and recovery point, objective graph,
friendly and enemy order of battle, first-action time budget, base state, weather
and time of day, briefing blurb, and cutscene needs.

The missions expose the following shared content and mechanics:

- moving road columns with route following, spacing, stopping/scattering behavior,
  and mission-visible survival counts
- truck, artillery, and command-vehicle objects beyond the existing tank and
  jeep/car types
- survivor/raft pickup state and Catalina rescue dwell logic
- onboard a player-flyable Mitsubishi Ki-57 "Topsy" through the same sourced
  aircraft-specification and deterministic Blender pipeline used for the other
  fleet aircraft; enroll it in the Library/Hangar, expose relevant transport/drop
  articulation on the test bench, and require attended visual approval before
  mission work depends on it
- use the Ki-57 for J5, **Night Drop on Burauen**, tied directly to Operation Te-Go;
  the former Zero convoy-escort chapter is removed, while J4's Ormoc Bay surface
  battle preserves the reinforcement-route story and both campaigns remain six
  chapters long
- landing craft and a seaplane tender/rescue launch if they are to be more than
  distant scenery
- staged formation waves so the finales feel large without keeping every aircraft
  in the expensive active-combat set for the entire mission
- campaign-owned persistent site state: owner, readiness, construction phase, and
  destroyed structure ids, all applied to one canonical layout per site

The asset-first gate in section 14 remains controlling: reconcile this list, build
and approve every needed reusable Blender asset in the Hangar, and only then make
campaign missions depend on those assets.

## 6. Night operations

Night must be a distinct gameplay condition, not the current dusk palette with a
later clock value and not near-black imagery that forces the player to fly blind.

### 6.1 Visual target

- Preserve a low moonlight/starlight floor so the horizon, large terrain masses,
  ocean, cloud silhouettes, and nearby aircraft remain legible after the player's
  eyes adapt.
- Add moon and star presentation, night sky and haze colors, water reflections,
  night exposure/adaptation, and cockpit instrument lighting.
- Fire, explosions, tracers, searchlights, flares, and lit structures must cast or
  contribute local light rather than merely use bright unlit textures.
- Cloud cover and moon phase may change visibility, but the authored campaign
  conditions must remain playable at the supported graphics settings.
- Define visual checkpoints from cockpit, external, runway, carrier-deck, target,
  and cloud-above/cloud-below views before building the night missions.

### 6.2 Aircraft lighting

Treat these aircraft as wartime aircraft, not cars with forward headlights:

- every flyable aircraft receives dim, player-adjustable cockpit/instrument
  illumination so its night missions remain operable
- aircraft may have airframe-specific landing lights, navigation lights, and
  formation/recognition/search lights only where historical references support
  the specific equipment
- landing lights illuminate only a relatively short approach/taxi region and make
  the aircraft easier for enemies to see; they should normally be used late in an
  approach, not throughout a combat sortie
- navigation/formation lights need pilot controls and mission/AI policy, including
  blackout conditions
- cockpit gauges and placards need dimmable red/amber illumination without washing
  out the outside view
- the aircraft data model should declare which lights exist rather than giving
  every model an invented universal light set
- AI wingmen may use nonvisual formation assistance at night so historical absence
  of a light does not make a formation mechanically incapable of holding station
- the reference/source pass must approve the exact external fixtures and their
  placement before corresponding Blender work begins

### 6.3 Runway, ship, and target lighting

- Airfields need period-appropriate runway-edge or flare-path lights, threshold
  cues, a windsock/operations-area light, and a way for the mission to switch them
  on briefly for takeoff or recovery.
- Carriers need restrained deck-edge/recovery cues and signal lighting. Combat
  ships and convoys should normally be darkened under threat; they should not sail
  around as brightly illuminated modern cruise ships.
- Ports and bases may expose blackout-controlled windows, fires, signal lamps,
  vehicle lights, and searchlights when the mission calls for them.
- Lighting state must affect detection and tactics: a lit runway helps the player
  land but also identifies the field; a flare reveals the target and nearby
  aircraft to both sides.

### 6.4 Flares and navigation aids

Aircraft-dropped illumination flares are historically credible and useful
gameplay. A wartime U.S. Navy
[anti-submarine and convoy escort manual](https://www.ibiblio.org/hyperwar/USN/ref/ASW-Convoy/ASW-Convoy-2.html)
describes parachute-flare attacks and specifically includes TBF and PBY release
procedures. The campaign can therefore stage an escort or lead aircraft dropping a
flare over the target, followed by a timed attack window. The shared flare asset
needs a descending canopy, delayed ignition, finite burn, drifting light volume,
smoke, and an AI/mission trigger.

Do not add a lighthouse merely because a modern light exists. The approved
initial roster is deliberately narrow:

- **Tacloban harbor:** the prewar
  [U.S. Coast Pilot](https://upload.wikimedia.org/wikipedia/commons/3/39/United_States_coast_pilot%2C_Philippine_Islands_%28IA_cu31924007510633%29.pdf)
  documents a fixed red light near Panirugan Point as well as the harbor approach
  and buoys. Model the fixture, but let occupation, blackout, damage, and mission
  state determine whether it is illuminated.
- **Dinagat and Homonhon:** the official Army history
  [*Leyte: The Return to the Philippines*](https://history.army.mil/portals/143/Images/Publications/catalog/5-9.pdf)
  records temporary steady-white navigation lights installed by the 6th Rangers
  on 17–18 October 1944, with reported visibility of approximately twelve and ten
  miles. They may appear in the invasion opening and early campaign state.
- **Suluan:** the same history records its existing lighthouse as damaged by naval
  bombardment. It may appear as damaged scenery, not a dependable operating aid.
- **Ormoc:** a historical
  [Notice to Mariners](https://www.jacar.archives.go.jp/acv/contents/pub/pdf/B11/B11092933500.b3_0098.3-2198.00000139.pdf)
  documents a fixed red light at the customs building. Include it only if the
  final source pass confirms that the fixture still existed in 1944; its wartime
  illumination remains mission-controlled.

Airfields use temporary portable lamps or flare paths, while the San Pedro Bay
seaplane anchorage uses tender, ship, flare, and signal lights. No other permanent
lighthouse or beacon enters the campaign without equivalent wartime evidence. A
[1944 Fifth Air Force navigation chart](https://www.awm.gov.au/collection/LIB100022056)
that marks marine lights is a cross-check for the final placement pass.

### 6.5 Night mission requirement

The American night chapter is **A4, Dumbo in the Gulf**, using a survivor flare and
lighted seaplane anchorage for a PBY rescue. The first Japanese night chapter is
**J4, Destroyers in the Bay**, using naval gunfire, tracers, fires, and a timed
illumination flare to reveal the torpedo target. A4 and J4 require the corresponding
Lieutenant (junior grade) rank. Both are historical composites, so the night
settings must be stated plainly rather than attributed to a particular documented
sortie.

**J5, Night Drop on Burauen**, is a second Japanese night chapter and requires
Lieutenant because the Ki-57 belongs to the advanced-aircraft category. The PBY is
multi-engine but is deliberately not rank-gated as advanced; engine count alone
does not determine aircraft eligibility.

Night implementation also requires:

- AI visual detection ranges and identification behavior based on ambient light,
  silhouettes, clouds, fires, tracers, searchlights, and aircraft lights
- player target markers/mission cues that guide without turning night into a HUD
  shooting gallery
- night takeoff, approach, carrier recovery, AAA, formation, and objective tests
- explicit performance budgets for local lights, shadows, flares, and tracers

## 7. Campaign headquarters, player identity, and sortie flow

### 7.1 Human player and faction-bound campaign records

When creating a campaign, the human player enters a name and chooses American or
Japanese. That nationality is permanent for the campaign record. The same person
may create another campaign for the other side, but each campaign is an independent
career that owns:

- its selected nation and campaign progress
- cumulative player points and command rating earned in that campaign, including
  its future public high-score standing
- mission badges and campaign victory records earned in that campaign
- aggregate kills, losses, rescues, captures, completed sorties, score-eligible
  sorties launched, and derived points-per-sortie efficiency
- its five-pilot live roster and archived pilot records
- its canonical base, territory, and world-state progression

Points, command rating, badges, progression, site state, pilots, and roster-strength
bonuses never transfer between American and Japanese campaigns. App preferences and
a remembered player name may be shared for convenience, but they carry no gameplay
progression.

Each campaign needs a human-player dossier distinct from every pilot dossier. It
should show the campaign nation, cumulative score, command rating, badges, aggregate
statistics, living roster strength, and a chronological campaign log.

The player uses **command appointments**, not a second set of pilot naval ranks,
so the interface never implies that the persistent player personally survived
every sortie. The five-step command-rating ladder is:

| Command appointment | Cumulative player points |
|---|---:|
| Squadron Commander | 0 |
| Air Group Commander | 20,000 |
| Wing Commander | 50,000 |
| Task Force Air Commander | 90,000 |
| Fleet Air Commander | 140,000 |

"Field Commander" is a land-force term and is a poor fit for this naval-air
metagame. Command appointments must not unlock combat capability. They provide a
durable measure of the human player's campaign performance and are intended to
become the rank labels for a future public high-score Wall of Fame.

Online identity, score submission, verification, moderation, and anti-cheat are
future public-game work rather than dependencies of the initial campaign. The
save schema should nevertheless preserve the campaign side, cumulative player
score, score-eligible sortie count, command appointment, scoring-rules version,
and relevant difficulty/config metadata so later leaderboards do not mix
incompatible scoring eras or campaigns.

### 7.2 Headquarters and mission-first selection

The opening campaign screen should still feel like a roster/headquarters desk, but
the pilot rows no longer contain **New mission** buttons. The primary action is
**Choose mission**:

1. Resume an existing campaign, create a new campaign, enter Single Missions, or
   enter Training. Creating a campaign requires a player name and a permanent choice
   of American or Japanese.
2. From campaign headquarters, choose the next Campaign Mission or an available
   Non-Campaign Mission.
3. Choose the mission. The card shows its story position, objective, aircraft,
   time/weather, minimum pilot rank, locked/unlocked reason, and expected first
   action time.
4. Assign a living pilot from that campaign's roster. Ineligible pilots remain
   visible but disabled with the exact missing-rank explanation.
5. Confirm aircraft/loadout and any choices the authored mission permits.
6. View the briefing and launch.

This order lets the player discover the requirement before choosing a pilot and
gracefully explains when no living pilot is eligible. It also avoids the current
failure mode of selecting a pilot, traversing several forms, and only later
discovering that the intended mission cannot be flown.

Campaign missions should normally own their date, time of day, weather range,
aircraft choices, and loadout limits. Single Missions and Training may retain more
of the current free-form conditions/aircraft/ordnance flow.

### 7.3 Pilot roster lifecycle

Each national side has exactly **five living pilots**. Five is large enough to
preserve senior pilots and make losses matter, but small enough that every record
remains recognizable.

- A new side campaign starts with five generated Ensign/Kaigun Shōi pilots.
- A killed or captured pilot leaves the live roster permanently and remains in
  the archive with a closed dossier and final result.
- On return to headquarters, each vacancy is filled automatically by a newly
  generated entry-rank pilot. The live roster therefore returns to five before
  the next sortie selection.
- A replacement does not inherit points, rank, badges, or statistics.
- Discharged pilots follow the same vacancy rule but keep a distinct archived
  status.
- Each roster belongs to one faction-bound campaign record. Pilots, roster state,
  points, and progression do not transfer between campaigns.

Capture is permanent for the initial campaign. A POW remains in the archive with
a closed dossier, can never be selected again, and cannot be restored by an
authored rescue or exchange event. A later expansion may add prisoner recovery;
if it does, a returned pilot must enter a reserve/archive-ready state rather than
silently expand the five-pilot active roster.

### 7.4 Generated pilot names

Maintain curated, source-reviewed data sets rather than procedurally inventing
syllables:

- American given names, family names, and rare optional suffixes
  (`Jr.`, `II`, `III`, `IV`; use `Sr.` only if the design deliberately
  represents the matching family relationship)
- Japanese family names and given names stored separately, displayed family-name
  first, with approved romanization and optional kanji for dossiers
- a deterministic seeded draw, duplicate prevention within the active and archived
  campaign roster, and tests for formatting and exhausted pools

Japanese names should not receive Western `Jr./Sr./II/III/IV` suffixes.
Japanese honorific suffixes are forms of address, not generational name suffixes.
The [Embassy of Japan naming guide](https://www.az.emb-japan.go.jp/files/000180840.pdf)
is a useful convention reference.

For the American pool, "era-appropriate diversity" means historically grounded
but not historically exclusionary. Build an inclusive pool of authentic 1940s
American names from period officer, unit, casualty, census, and muster sources—
starting with the [National Archives' World War II records](https://www.archives.gov/research/military/ww2)
and Navy personnel holdings. It should naturally include names associated with
Black, Hispanic, Native American, Asian-American, European immigrant-family, and
other American communities without imposing modern demographic percentages or
stereotyped name buckets. The campaign does not reproduce the discriminatory
officer-access restrictions of the 1944 services. Do not store or display an
ethnicity field, apply quotas in the interface, or attach any gameplay effect to
a name.

## 8. Scoring, pilot promotion, and player command rating

The current game awards destruction points only:

| Target | Current points |
|---|---:|
| Fighter | 500 |
| Bomber | 750 |
| Cruiser | 1,500 |
| Battleship | 3,000 |
| Destroyer | 750 |
| Transport | 400 |
| AAA battery | 250 |
| Runway | 500 |
| Building | 150 |
| Tank | 300 |
| Carrier | 5,000 |

The approved campaign baseline preserves that scale while adding missing target
classes and modestly increasing two ship values:

| Destroyed object | Campaign points |
|---|---:|
| Truck, car, or light vehicle | 100 |
| Building | 150 |
| Landing craft or small patrol boat | 250 |
| AAA battery | 250 |
| Tank | 300 |
| Fighter or attack aircraft | 500 |
| Runway | 500 |
| Transport or cargo ship | 500 |
| Bomber or transport aircraft | 750 |
| Destroyer | 1,000 |
| Cruiser | 1,500 |
| Battleship | 3,000 |
| Carrier | 5,000 |

Any enemy target that takes actual durability damage from the assigned player
aircraft is marked for full credit. If it is destroyed later in the same sortie—
whether by the player, a friendly, a crash, or continuing damage—the full table
value enters both that pilot's career ledger and the human player's campaign
ledger exactly once when the sortie reaches a normal debrief. Merely hitting
without causing damage earns no tag; a tagged target that survives earns no
points. Friendly destruction of a target the player never damaged earns no
points. Explicit abandonment or a friendly-destruction discharge forfeits the
sortie's entire score.

It currently promotes one persistent pilot at 0 / 2,500 / 7,500 / 17,500 /
35,000 / 60,000 points through Captain, then continues into flag ranks. Death,
ditching, and landing all use a full 1.0 score multiplier. Those rules were built
for resurrection and do not fit the new roster. The campaign system replaces that
curve with the following shared six-tier progression:

| Tier | American rank | Japanese counterpart | Total pilot points |
|---:|---|---|---:|
| 1 | Ensign | Kaigun Shōi | 0 |
| 2 | Lieutenant (junior grade) | Kaigun Chūi | 2,500 |
| 3 | Lieutenant | Kaigun Taii | 7,500 |
| 4 | Lieutenant Commander | Kaigun Shōsa | 15,000 |
| 5 | Commander | Kaigun Chūsa | 25,000 |
| 6 | Captain | Kaigun Taisa | 40,000 |

American and Japanese pilots use identical point requirements and promotion
mechanics. Only their displayed naval rank titles differ. There are no campaign
pilot ranks above Captain.

### 8.1 Two score ledgers

- **Pilot sortie/career points** belong to the assigned pilot and determine the
  six approved pilot ranks. A living or rescued pilot can be promoted at debrief.
  A killed or captured pilot's final points remain in the archived dossier but can
  no longer produce a live-roster promotion.
- **Human-player points** persist across every pilot in that one campaign. They
  drive its command rating and future Wall of Fame standing and absorb its agreed
  live-roster-rank bonus, but never carry into a campaign for the other nation.

One event can feed both ledgers, but the formulas must be explicit and tested.
Raw human-player points deliberately remain cumulative and unbounded: repeating a
score-eligible non-campaign mission can continue adding points. Alongside that raw
total, track **adjusted score** as cumulative human-player points divided by the
number of score-eligible sorties launched. Increment and persist the denominator
when a campaign or in-campaign non-campaign sortie begins, so completed, failed,
abandoned, KIA, POW, and zero-point attempts all count. Training, developer
scenarios, and Single Missions outside the campaign record count toward neither
value. The future Wall of Fame may expose separate raw-total and points-per-sortie
boards rather than pretending the two achievements are interchangeable.

### 8.2 Destruction score; badges for mission success

Destruction is the default source of points. There are no generic point awards for
a primary objective, secondary objective, protected friendly, survivor, recovery,
or first campaign completion. Successful primary objectives plus authored
recovery award the mission badge and campaign advancement, which are meaningful
rewards independent of score. A sortie that reaches a normal debrief banks its
legitimate destruction points even if the player lands without completing the
objective, bails out, ditches, is rescued, becomes POW, or dies. It awards no badge
or campaign advancement unless it satisfies the mission's authored completion
conditions. Explicitly quitting or abandoning before a normal debrief forfeits
the entire sortie score.

Author each mission so the expected destruction credited to the player is roughly
one rank interval appropriate to its minimum eligible pilot:

| Mission's minimum rank | Typical player-credited destruction budget |
|---|---:|
| Ensign / Kaigun Shōi | approximately 2,500 |
| Lieutenant (junior grade) / Kaigun Chūi | approximately 5,000 |
| Lieutenant / Kaigun Taii | approximately 7,500 |
| Lieutenant Commander / Kaigun Shōsa | approximately 10,000 |
| Commander / Kaigun Chūsa | approximately 15,000 |
| Captain / Kaigun Taisa finale | not progression-limited |

These are authoring targets, not caps. Exceptional performance may cross more than
one rank threshold, and later ranks may still take multiple sorties when a pilot
earns less than the mission's expected budget.

A mission with structurally little or no opportunity for destruction may declare
an explicit completion bonus. It must be justified and visible in mission content,
awarded to both ledgers, and gated by the same primary-objective and authored-
recovery conditions as its badge. A4, **Dumbo in the Gulf**, is the initial case
and awards 2,500 points. There is no general objective or recovery bonus to stack
on top. Spawning, repeating a checkpoint, and destroying a practice target never
award campaign points.

Friendly-fire consequences are categorical rather than proportional. Actual
nonfatal damage to a friendly aircraft, ship, structure, or vehicle produces an
immediate warning but no score deduction or discharge by itself. If the player
causes a friendly target's destruction, the assigned pilot is dishonorably
discharged, the dossier is archived with that status, the live-roster vacancy is
filled under the normal replacement rule, and the sortie banks zero points and no
badge or completion awards. This uses actual player-caused friendly destruction,
not the more generous enemy-target damage-tag rule.

After every badge-earning campaign or in-campaign non-campaign sortie, award the
human-player ledger a living-roster bonus based on the post-sortie five-pilot
roster:

| Living pilot rank | Human-player bonus |
|---|---:|
| Ensign / Kaigun Shōi | 0 |
| Lieutenant (junior grade) / Kaigun Chūi | 100 |
| Lieutenant / Kaigun Taii | 200 |
| Lieutenant Commander / Kaigun Shōsa | 300 |
| Commander / Kaigun Chūsa | 400 |
| Captain / Kaigun Taisa | 500 |

Sum all five living pilots, for a current maximum of 2,500 points. The award goes
only to the human-player ledger and therefore cannot promote a pilot. Failure,
abandonment, bailout, POW, KIA, or any result without the badge conditions earns
no roster bonus. Losing a senior pilot lowers future awards but never subtracts
points already banked. The 100-point step is an initial balance value; simulations
may tune its magnitude without changing those structural rules.

Difficulty never multiplies destruction values. Instead, every badge-earning
sortie receives a fixed completion bonus based on the difficulty selected and
stored at launch:

| Difficulty | Pilot and human-player completion bonus |
|---|---:|
| Recruit (`easy`) | 0 |
| Veteran (`normal`) | 500 |
| Ace (`hard`) | 1,000 |

The bonus applies to campaign and in-campaign non-campaign sorties, including
eligible repeats, and is paid to both ledgers. It stacks with an explicitly
authored low-damage exception such as A4's 2,500-point PBY award. Changing a
setting after launch cannot alter the bonus. Accessibility, control assists,
graphics settings, and other non-difficulty preferences never change score.

### 8.3 Balancing work

Simulate a reasonable campaign run, a run with one or two pilot losses, and
side-mission recovery from a roster with only Ensigns. Confirm that the approved
thresholds and mission score budgets create stakes without forcing repetitive
grinding. Finalize any additional mission-specific completion bonuses as a
content-balancing pass; the explicit-abandonment forfeiture and friendly-fire
conduct rules are already decided.

## 9. Bailout, capture, and rescue

Use **bailout**, not ejection: these aircraft do not have modern ejection seats.
The player must deliberately leave a still-airborne aircraft, clear the airframe,
and descend under a parachute. This adds a fourth recovery family alongside
landing, ditching, and death.

### 9.1 Outcome model

A bailout can resolve as:

- **rescued** — pilot returns to the live roster, keeps legitimately earned
  destruction points, may be promoted, but receives no mission badge because the
  aircraft was not returned unless rescue is the mission's authored recovery
- **captured/POW** — pilot is removed from the live roster and archived as POW;
  the closed pilot dossier and human-player ledger retain their legitimately
  earned sortie points
- **killed/missing** — bailout failed because of altitude, impact, fire, terrain,
  water conditions, or failed recovery

The outcome uses deterministic rules at clear extremes and a recorded seeded roll
only in contested situations. Friendly-base, friendly-carrier, or active friendly
rescue-patrol coverage makes rescue effectively certain unless the bailout itself
fails. Deep enemy-controlled territory with no plausible friendly rescue presence
makes capture effectively certain. Between those extremes, the seeded resolver
weighs:

- distance to the nearest friendly and enemy airfield, ship, and controlled site
- which side controls the terrain/water region
- friendly rescue craft or search aircraft present in the mission
- enemy ground/ship presence near the landing point
- whether the pilot lands on land or water
- daylight, visibility, weather, and sea state

Before the player bails out, the HUD shows a qualitative assessment such as
**RESCUE LIKELY**, **CONTESTED**, or **CAPTURE LIKELY** rather than an unexplained
percentage. The debrief shows the material factors and result. Proximity and
control dominate the contested roll so the player's choice matters. The random
seed and complete resolver inputs are stored in campaign/debug data and the Dev
Flight Recorder, making the result exactly reproducible. The campaign also needs
a clear bailout command, safety constraints, and feedback when escape is
impossible or too late.

### 9.2 Shared parachute asset

Build one approved parachute canopy, harness, and suspended-person rig that can
serve:

- the player's bailout sequence
- downed AI aircrew where performance permits
- the Japanese Ki-57 paratrooper mission

The paratrooper mission still needs formation exit, multiple descending entities,
drop-zone objectives, landing/dispersal behavior, and performance controls; asset
reuse does not make those mechanics free.

### 9.3 System changes implied

- new pilot-aircraft separation and bailout state in the simulation
- parachute descent, drift, ground/water contact, and visual entity lifecycle
- a recovery/capture resolver using scenario ownership and mobile ships
- new mission recovery results, debrief language, dossier statuses, scoring, and
  campaign replacement behavior
- AI and mission hooks for friendly rescue patrols and paratroop drops, plus a
  clean future extension seam for prisoner recovery without implementing it
- automated tests for impossible/low-altitude bailout, friendly rescue, capture,
  water landing, roster replacement, scoring, and badge denial

## 10. In-engine campaign cutscenes

These are authored scenes rendered in the real game world, not prerendered movies.
They use canonical bases, approved aircraft/vehicles/ships, real weather and
lighting, scripted entity motion, radio/text, and authored camera paths.

### 10.1 Fixed scene inventory

- All twelve campaign chapters receive one **10–20 second skippable opening** that
  establishes the location, immediate danger, and primary objective.
- The A1 and J1 openings also introduce the respective campaign's historical
  situation and point of view; a separate campaign-introduction movie is not
  required.
- Ordinary chapters have no bespoke ending cinematic. Their debrief, headquarters
  log, map, and persistent world changes carry the result into the next chapter.
- A6 and J6 receive full victory scenes only after the player completes the primary
  objective and authored recovery condition. The game safely banks the result
  before playback begins.
- Every scene is skippable without changing simulation, score, roster, campaign, or
  world-state results. Skipping an opening launches immediately and must not consume
  any of the 5–7 minute time-to-action budget.

### 10.2 Victory scenes and epilogues

The **American victory** opens at dawn over the surviving Leyte airfields. The
player's aircraft and other returning formations recover while repair crews work,
transports unload, and the secured American fleet operates in the gulf. A concise
historical epilogue explains that the airfield counterattack failed and the
American position on Leyte continued to consolidate.

The **Japanese victory** begins with the player landing at captured Buri or Bayug.
Japanese aircraft and ground forces consolidate the fields, fires mark the damage
around Tacloban, and American ships withdraw from the beachhead. The closing text
must explicitly label this as alternate history and identify the successful J5/J6
coordination as the point of divergence from the historical Japanese defeat.

There is no current cutscene framework. The instant-replay camera and deterministic
world snapshots may supply reusable camera/interpolation ideas, but campaign
timelines, scripted actions, skip/restore behavior, subtitles, audio policy, and
tests are new work. Freeze each opening's shot list, actors, radio/text, duration,
and skip state during final mission definition so asset production does not discover
new dependencies late.

## 11. Persistence and mid-flight saves

### 11.1 Required campaign persistence

Each faction-bound campaign record must autosave after every banked debrief and
roster change. A campaign index may list several independent careers, but every
save owns its selected nation, human-player identity, command score and rating,
unlocked chapter, canonical site state, live and archived pilots, scores, and
badges. No progression field is shared between campaign records. Use a versioned
schema and migration from the current `ww2airsim.roster.v1` data. Expose campaign
import/export in the UI so browser storage loss does not erase a long career.

### 11.2 Mid-flight save assessment

Mid-flight save/resume is feasible in principle but is a high-complexity feature,
not a small extension of roster persistence. The core `World` is designed as
plain cloneable state, but a complete resume also has to restore typed terrain
arrays and sets, mission and AI state, control/assist memory, projectile/damage
state, renderer effects, audio edge memory, replay recording, UI/debrief flow,
input latches, clocks, asset identity, and schema compatibility across releases.
A partial snapshot could resume into a visually or behaviorally different flight.

**Decision:** defer mid-flight save/resume from the initial campaign. Campaign and
roster progress autosave between sorties; a flight in progress must be completed,
abandoned, or restarted. The short mission and 5–7 minute time-to-action goals make
that acceptable and let implementation effort go to campaign content. The Dev
Flight Recorder remains required diagnostic tooling, but its recordings and
compressed keyframes are not player save slots and cannot resume campaign play.

If this is revisited, use one **Suspend sortie** slot rather than unrestricted
save/load. The player would not be forced to finish it before doing anything else,
but starting another sortie in that same campaign would require explicitly
abandoning the suspension. That prevents ambiguous parallel campaign states while
avoiding a hard lock.

## 12. Current-code reality check

The code review behind this brainstorm found:

- the title screen is pilot-first: each manually created pilot row has
  **New game**, followed by Flight Type, Sortie Orders, Conditions, Aircraft, and
  Ordnance forms
- the roster permits unlimited manually named pilots and resurrects a dead pilot
  when that pilot starts another sortie
- one pilot record currently owns cumulative score/rank, badges, kills, status,
  resurrection count, and career log in `localStorage`
- the only recovery outcomes are `landed`, `ditched`, and `killed`; no
  bailout, parachute, POW, or rescue system exists
- scoring already has the target table in section 8, but no general objective
  point system
- current friendly-fire bookkeeping records the first friendly hit and the debrief
  then forfeits the sortie and discharges a surviving pilot for any friendly
  damage; campaign implementation must narrow discharge to player-caused friendly
  destruction while retaining the existing immediate warning for nonfatal damage
- time-of-day content exposes Morning, Midday, and Dusk only; the sun/exposure and
  sky code intentionally clamp to a readable twilight floor because true night
  lighting does not exist
- the base scene uses sun and hemisphere lighting; there is no general local-light
  system for runway lights, ship lights, landing lights, or flares
- there is no campaign cutscene system
- the simulation world is deliberately close to a complete deterministic flight
  snapshot, which helps a future save system, but renderer/audio/replay/UI state
  lives outside it and some world fields do not round-trip through plain JSON

These are replacement-sized changes to the metagame and frontend, not additions to
the current roster screen. The later `GAMEPLAY.md` rewrite must remove
resurrection and document the new player profile, roster lifecycle, mission-first
flow, scoring, bailout results, night behavior, and campaign persistence.

## 13. Dev Flight Recorder

Queue a compact deterministic flight recorder as shared development tooling before
campaign mission production. It is for reproducing simulation, mission, AI,
collision, scoring, and visual inconsistencies reported during testing; it is not
a mid-flight save system and is not a normal player-facing feature.

### 13.1 Access and lifecycle

- Expose the recorder only when the existing Dev mode is active.
- Start it automatically for every Dev sortie after the scenario, terrain, and
  selected flight configuration are settled. A bug cannot be recorded after the
  player notices it if the required history was never captured.
- Retain only the current or most recently completed Dev flight in memory.
- Provide **Export flight record** from Pause and Debrief. Starting another flight
  may discard an unexported record after a clear warning.
- Import belongs in a Dev reproduction/playback surface, not in the ordinary
  campaign menus.

### 13.2 Compact deterministic V1

Do not extend the current full-world instant-replay ring across the entire flight.
Its worst existing test retains about 66.8 MB for ten seconds of a gun-heavy
scenario, which would scale to gigabytes for a complete mission.

Instead, export a versioned compressed `.ww2flight` record containing:

- recorder schema version, exact Git/build identity, and content hashes
- scenario id, aircraft, loadout, time, weather, difficulty, assists, and relevant
  Dev settings
- browser, operating-system, GPU, and graphics settings needed to diagnose visual
  problems
- one initial deterministic world state captured after terrain settlement
- the final control packet actually applied to every fixed simulation tick—not
  merely raw key-down events
- tick-stamped discrete actions such as gear, flaps, hook, bay doors, weapon
  release, wingman orders, pause, and time compression
- deterministic mission/combat events and a world checksum at a fixed interval,
  initially once per simulated second
- the final world checksum/state summary and debrief result

Recording applied controls is essential. The current keyboard layer ramps axes
using render-frame elapsed time, so identical key events on two machines can
produce different control deflections. The recorder must tap the fixed-step path,
or expand each frame's final controls over the exact ticks that consumed them, so
render rate and dropped-frame behavior do not change the reproduction.

Static terrain and asset payloads should normally be referenced by content hash,
not embedded. Playback should reject an unavailable or mismatched original build
with a precise explanation rather than silently claim an exact reproduction.

### 13.3 Reproduction modes

- **Headless verification:** rebuild the initial world, apply recorded controls and
  actions, compare periodic checksums, and report the first divergent tick and
  subsystem-visible events around it.
- **In-game playback:** resimulate the record and use the existing replay cameras
  to inspect the reproduced flight.
- **Fix comparison:** first reproduce against the recorded commit, then run the
  same record against a candidate fix and report the intentional divergence.

The checksums are diagnostic evidence, not correction points. Playback must not
snap the simulation back into agreement and conceal nondeterminism.

### 13.4 Keyframe ruling for V1

V1 includes the initial state and final state summary but **no periodic compressed
world keyframes**. Deterministic headless resimulation can run much faster than
real time, and the campaign's short-mission target makes replaying from takeoff
reasonable.

Periodic keyframes would later add fast seeking, permit inspection of recorded
late-flight state after an earlier divergence, and provide better evidence across
code revisions. They also add substantially larger files, compression work,
schema/version complexity, and a risk of masking the very divergence being
investigated. If measurements later justify them, add an independent Dev option
with sparse 30–60 second keyframes rather than making them part of the base format.

### 13.5 Acceptance gates

- A representative recorded flight re-simulates bit-identically on the same build
  through takeoff, combat, mission triggers, landing/crash, and debrief.
- Tests cover pause, triple time, a frame hitch/dropped steps, continuous guns,
  one-shot ordnance, wingman commands, held/spawned mission groups, and terrain
  settlement.
- A corrupted file, unknown schema, missing build, or content-hash mismatch fails
  safely with an actionable message.
- A deliberate simulation perturbation produces a first-divergence report at the
  expected tick.
- CPU, memory, and export-size budgets are established by prototype measurement,
  with no perceptible input or frame-time regression in Dev flight.
- Normal non-Dev sessions allocate no recorder buffers and expose no recorder UI.

## 14. Decision log for the eventual design spec

### 14.1 Decided

#### Asset-first implementation gate — decided 13 October 2026

Implementation begins by identifying every additional **individual reusable
asset** the approved campaigns require. Any such asset that must be authored in
Blender is built, enrolled in the Library/Hangar, and viewed there before work
moves on to canonical base layouts, campaign mechanics, or mission scripting.

This is an approval gate, not merely a modeling task:

1. Reconcile the final mission set into one explicit asset inventory. Do not
   build every possibility mentioned in this brainstorm by default.
2. Build the missing aircraft, ships, vehicles, structures, and standalone
   scenery/mission objects in Blender, with provenance and specifications
   recorded through the existing asset pipeline.
3. Enroll each reusable model in the Library/Hangar. Expose relevant animation
   or articulation controls on the Hangar test bench.
4. Use attended Hangar viewing checkpoints so Mark can approve or reject each
   asset before it is depended on by a base or mission.
5. Freeze the approved asset set, then build the canonical persistent sites and
   shared campaign mechanics. Mission scripting and campaign progression follow
   those foundations.

Procedural or instanced treatments that are not individual Blender-authored
models—such as mud, standing water, runway damage decals, or repeated clutter—do
not need artificial Hangar entries. Their visual checkpoints belong with the
base-layout work that uses them.

#### Campaign identity and pilot-rank progression — decided 13 October 2026

Campaign victory means completing the authored campaign missions in sequence.
Those missions may require a living roster pilot of a specified minimum rank.
Repeatable non-campaign missions, based initially on the existing mission set,
remain available without advancing the campaign so the player can earn points and
promote surviving or replacement pilots until someone is eligible for the next
campaign mission.

Within each faction-bound campaign, the human player and the pilots are separate
records:

- The human player retains cumulative points, player rank, campaign progress,
  mission badges, and aggregate results. Player rank unlocks no command abilities,
  but is the durable competitive standing intended for a future public high-score
  Wall of Fame.
- The campaign owns a roster of named pilots. Death permanently closes that
  pilot's record; campaign progress and the human player's accumulated points do
  not reset.
- **Rank is the pilots' only progression and eligibility variable.** There are no
  fighter/bomber specialties, aircraft qualifications, proficiency ratings, or
  skill bonuses. Any living pilot may fly any aircraft and mission allowed by
  rank.
- A human-player score bonus is derived from the number and ranks of living
  pilots, giving the player an additional reason to preserve senior officers.
  The exact formula and award timing remain balancing decisions.

The game deliberately uses only naval rank ladders, including for pilots flying
aircraft that historically belonged to an army air service. Requirements are
cumulative:

| Tier | American rank | Japanese rank | Total pilot points | Newly eligible mission class |
|---:|---|---|---:|---|
| 1 | Ensign | Kaigun Shōi | 0 | Daytime, single-engine missions |
| 2 | Lieutenant (junior grade) | Kaigun Chūi | 2,500 | Night missions |
| 3 | Lieutenant | Kaigun Taii | 7,500 | Advanced aircraft |
| 4 | Lieutenant Commander | Kaigun Shōsa | 15,000 | Bombsight and torpedosight |
| 5 | Commander | Kaigun Chūsa | 25,000 | Leads coordinated operations containing multiple formations or aircraft types |
| 6 | Captain | Kaigun Taisa | 40,000 | Eligible to fly the campaign finale |

"Advanced aircraft" is a curated eligibility category, not a synonym for
multi-engine. The initial category is fixed as:

| Side | Lieutenant-gated advanced aircraft |
|---|---|
| American | P-38 Lightning; B-17 Flying Fortress; B-29 Superfortress |
| Japanese | G4M1 Betty; Ki-21-IIb Sally; Mitsubishi Ki-57 "Topsy" |

The PBY-5A is not advanced and is explicitly available to a Lieutenant (junior
grade) in the A4 night chapter despite having two engines. The F4F, F6F, F4U, TBM,
A6M2, Ki-43, Ki-84, D3A, and B5N likewise have no advanced-aircraft gate; their
night, command, or authored mission requirements may still demand a higher rank.
Future aircraft require an explicit classification decision when onboarded.

The Lieutenant Commander's ordnance sights are rank-gated information aids, not
separate qualifications. With bombs selected, the bombsight marks the predicted
ground impact point for a release at that instant. With a torpedo selected, the
torpedosight shows the current water-entry/intercept solution and whether the
aircraft is inside the valid release envelope. Each prediction uses current
aircraft, weapon, and target motion; it does not anticipate later target evasion
or remove normal weapon dispersion. Lower-ranked pilots may still release either
weapon, but receive no predicted solution.

This replaces an automatic qualified-replacement safeguard: if no living pilot
meets the next campaign mission's requirement, the player uses non-campaign
missions to develop one. Every campaign must therefore retain accessible entry-rank
non-campaign missions, and their promotion pacing must not turn recovery from pilot
loss into an excessive grind.

Directly purchasing pilot promotions is only a distant possible freemium feature,
not part of the initial campaign design. The initial progression must be balanced
around earning every promotion through play and must not manufacture grind in
anticipation of monetization.

#### Fixed five-pilot side rosters — decided 13 October 2026

Each American or Japanese campaign maintains exactly five living pilots.
When a pilot becomes KIA, POW, or discharged, that pilot's closed dossier remains
in that campaign's archive. On return to headquarters, the vacancy is
automatically filled by a newly generated entry-rank pilot who inherits none of
the predecessor's points, rank, badges, or statistics. A roster never spans or
transfers between campaigns.

#### Human-player command-title ladder — decided 13 October 2026

The persistent human player advances through Squadron Commander, Air Group
Commander, Wing Commander, Task Force Air Commander, and Fleet Air Commander.
These are command appointments rather than a second set of pilot naval ranks. They
unlock no aircraft, missions, weapons, sights, or command abilities. Their
cumulative player-point thresholds are 0, 20,000, 50,000, 90,000, and 140,000.
The rating is a durable competitive achievement and is intended to label the
future public high-score Wall of Fame. Public score submission, identity,
verification, moderation, and anti-cheat remain future work; the initial campaign
must preserve scoring-version metadata so later boards can compare compatible
records.

#### Cumulative and adjusted public scores — decided 13 October 2026

Human-player points remain unbounded cumulative career points; repeatable eligible
missions may be used indefinitely. The campaign also derives adjusted score as
player points divided by score-eligible sorties launched. The sortie counter is
persisted at launch and includes success, failure, abandonment, KIA, POW, and
zero-point results, preventing omitted losses from inflating efficiency. Training,
developer scenarios, and out-of-campaign Single Missions are excluded. A future
Wall of Fame may rank raw total and points per sortie separately.

#### Campaign destruction-point baseline — decided 13 October 2026

Player-credited destruction awards 100 points for a truck/car/light vehicle; 150
for a building; 250 for a landing craft/small patrol boat or AAA battery; 300 for
a tank; 500 for a fighter/attack aircraft, runway, or transport/cargo ship; 750
for a bomber/transport aircraft; 1,000 for a destroyer; 1,500 for a cruiser;
3,000 for a battleship; and 5,000 for a carrier. The same value enters the assigned
pilot and human-player ledgers. There are no generic objective, survival, or
recovery awards.

#### Full credit for every player-damaged target — decided 13 October 2026

Any actual player-caused damage tags an enemy target for the duration of that
sortie. If the target is eventually destroyed by any cause, both the assigned
pilot and human player receive its full destruction value exactly once. There is
no percentage threshold, partial assist award, final-blow requirement, or extra
command credit for untouched wingman kills. A damaged target that survives the
sortie awards nothing.

#### Damage-led scoring and authored exceptions — decided 13 October 2026

Mission badges and campaign advancement, rather than generic bonus points, reward
completion of primary objectives and authored recovery. Mission authors budget
typical player-credited destruction at approximately 2,500 / 5,000 / 7,500 /
10,000 / 15,000 points for Ensign through Commander content; the Captain finale
is not progression-limited. These are targets, not promotion caps. A structurally
low-damage mission may explicitly define a completion bonus gated by full badge
conditions. A4's PBY rescue is the initial exception at 2,500 points to both
ledgers.

#### Badge-gated living-roster bonus — decided 13 October 2026

After a badge-earning sortie, the human-player ledger receives 0 / 100 / 200 /
300 / 400 / 500 points for each living Ensign through Captain counterpart in the
post-sortie five-pilot roster, summed to a current maximum of 2,500. Pilot ledgers
receive none of this award. Failed recovery, abandonment, bailout, POW, KIA, and
other non-badge outcomes earn no roster bonus. Senior-pilot loss reduces future
bonuses but does not remove banked points. Balance testing may tune the 100-point
step while preserving this structure.

#### Fixed graded difficulty completion bonus — decided 13 October 2026

Destruction values are identical on every difficulty. A badge-earning sortie adds
0 points on Recruit, 500 on Veteran, or 1,000 on Ace to both the assigned pilot
and human-player ledgers. The launch-time difficulty fixes the award, which applies
to eligible campaign and non-campaign repeats and stacks with an authored mission
exception. Accessibility and control assists do not modify score.

#### Shared national pilot-promotion thresholds — decided 13 October 2026

American and Japanese pilots advance through equivalent six-tier naval ladders
at the same cumulative pilot-point thresholds: 0, 2,500, 7,500, 15,000, 25,000,
and 40,000. The displayed ranks are Ensign through Captain for Americans and
Kaigun Shōi through Kaigun Taisa for Japanese pilots. Captain is the highest
campaign pilot rank; flag ranks from the current resurrection-era system do not
carry into the campaign design.

#### Permanent initial-campaign POW status — decided 13 October 2026

A pilot captured during the initial campaign is permanently removed from the
live roster and retained in the archive with a closed POW dossier. The normal
entry-rank replacement fills the vacancy. No initial authored mission, rescue,
exchange, or random event can return that pilot. Prisoner recovery remains a
possible later expansion and must not complicate the initial roster lifecycle.

#### Deterministic-extremes, seeded-contested bailout resolver — decided 13 October 2026

Bailout rescue or capture is deterministic where friendly rescue or enemy control
is overwhelming. Contested outcomes use a recorded seeded roll weighted by world
control, nearby bases and ships, rescue and enemy assets, surface type, weather,
visibility, and time. The HUD presents a qualitative risk cue before bailout, and
the debrief explains the decisive factors. Seeds and resolver inputs are retained
for exact Dev Flight Recorder reproduction. A capture result then follows the
permanent initial-campaign POW rule.

#### Historically grounded, inclusive American names — decided 13 October 2026

The American pilot-name pool uses authentic names appropriate to 1940s America
and includes modest representation from the country's varied communities. It
does not mechanically recreate discriminatory wartime officer demographics and
does not use modern demographic percentages. Ethnicity is neither a stored pilot
attribute nor a gameplay variable; representation emerges only from the curated
given-name and surname data.

#### Historically sourced aircraft lights — decided 13 October 2026

Every flyable aircraft receives dimmable cockpit/instrument lighting for night
playability. External navigation, landing, formation, recognition, and search
lights are airframe-specific and require historical support; aircraft do not
receive invented universal headlights. External lights can be extinguished under
blackout conditions. AI may receive invisible formation assistance, and the exact
fixture inventory and placement are approved during the source pass before an
airframe is modified in Blender.

#### Wartime navigation-light roster — decided 13 October 2026

The initial world may use Tacloban's blackout-controlled harbor light, the
temporary Dinagat and Homonhon invasion navigation lights, and the bomb-damaged
Suluan lighthouse. Ormoc's customs-building red light remains conditional on a
final 1944 existence check. Runways and the San Pedro Bay seaplane anchorage use
temporary mission-controlled lights rather than invented permanent beacons. No
modern light is sufficient evidence by itself.

#### Faction-bound independent campaign careers — decided 13 October 2026

The player chooses American or Japanese when creating a campaign, and that choice
cannot be changed within the campaign. The same person may create a second campaign
for the other side, but it is a wholly independent career. Human-player points,
command rating, badges, campaign progress, canonical site state, pilots, archives,
and roster-strength bonuses do not cross between American and Japanese campaigns.
Only non-progression conveniences such as app settings or a remembered player name
may be shared.

#### Mid-flight saves deferred — decided 13 October 2026

The initial campaign will not support saving or resuming a sortie in progress. It
will autosave durable campaign and roster state between sorties; an active sortie
must be completed, abandoned, or restarted. The Dev Flight Recorder remains in
scope as development-only reproduction and playback tooling, not as a player-facing
save system. A single suspend-sortie slot may be reconsidered after the campaign is
complete and stable.

#### Sequential victory gates and repeatable non-campaign missions — decided 13 October 2026

Campaign missions unlock and must be completed in sequence. The next chapter opens
only when the current mission's primary objective and authored recovery condition
both succeed; a failed or abandoned attempt does not advance into an alternate
campaign branch. A normally concluded failed attempt banks legitimately earned
player and pilot destruction points, while explicit mid-sortie abandonment banks
zero points. In either case, the current mission remains available to retry, no
campaign mission badge is granted, and no successful canonical world-state
transition is applied.

The existing scenario set becomes the initial repeatable Non-Campaign Mission pool.
These missions let the player earn points and promote surviving or replacement
pilots until one meets the next campaign mission's rank requirement. They do not
unlock chapters or alter canonical campaign state. Each campaign must always offer
at least one entry-rank non-campaign mission so roster losses cannot deadlock
progression.

#### Night chapters and advanced-aircraft rank gate — decided 13 October 2026

A4, **Dumbo in the Gulf**, is the American night chapter, using a survivor flare
and lighted seaplane anchorage to support the PBY rescue. J4, **Destroyers in the
Bay**, is the first Japanese night chapter, using naval gunfire, tracers, fires, and
a timed illumination flare to expose the torpedo target. Both require the
respective Lieutenant (junior grade) rank. J5, **Night Drop on Burauen**, is a
second Japanese night chapter and requires Lieutenant because the Ki-57 is an
advanced aircraft.

Lieutenant now unlocks a curated **advanced aircraft** category rather than all
multi-engine aircraft. Engine count alone does not set rank eligibility, and the
PBY is available to a Lieutenant (junior grade) for A4. The fixed initial advanced
list is P-38, B-17, and B-29 for the Americans and G4M1, Ki-21-IIb, and Ki-57 for
the Japanese. A3 introduces the American gate with the P-38; J5 introduces the
Japanese gate with the Ki-57.

#### Japanese late-campaign mission reconciliation — decided 13 October 2026

The former J4 Zero convoy-escort mission, **Ormoc Lifeline**, is removed. The night
torpedo mission **Destroyers in the Bay** becomes J4 and retains the Ormoc
reinforcement-route story. J5 becomes **Night Drop on Burauen**, a player-flown
Ki-57 paratrooper mission whose successful lodgment carries directly into the J6
Operation Te-Go finale. The campaigns remain equal at six chapters each.

#### Authored campaign recovery gates — decided 13 October 2026

Campaign completion requires both primary-objective success and the mission's
authored recovery. A reachable in-world carrier, runway, or seaplane anchorage must
be used; a designated friendly egress boundary counts only when the historically
appropriate recovery base lies outside the playable world. Bailout, rescue,
capture, death, ditching, or any other recovery failure after objective success
still banks legitimate points and records the sortie, but awards no campaign badge,
applies no successful world-state transition, unlocks no chapter, and leaves the
mission available to retry.

#### Finale mixed-force population target — decided 13 October 2026

Each completed finale initially targets 24 total airborne aircraft, including the
player, plus 10 simultaneously present ships. At most 16 aircraft occupy the close
combat area; the remainder use distant formations and staged transitions so the
battle reads larger without becoming one undifferentiated furball. Both finales
include an American naval support/transport group in Leyte Gulf or San Pedro Bay,
with mission-relevant ship weapons and AAA active.

The completed authored scene—not only the synthetic swarm—must keep GPU p95 and
live main-thread work p95 within the 16.7 ms 60 FPS budget at 2560 × 1440 High on
the reference hardware while cockpit, clouds, terrain, vehicles, weapons, fires,
damage effects, and mission logic are active. Any count reduction requires a later
explicit design decision.

#### Initial campaigns end on 7 December — decided 13 October 2026

The initial American and Japanese campaigns each end with their 6–7 December
sixth-chapter finale. Victory scenes and epilogues carry the narrative through the
historical American consolidation or the alternate Japanese expulsion of the
beachhead; neither path adds a playable post-finale chapter. Ormoc and Tanauan stay
in the canonical location and asset plan with historically appropriate states, and
may support a later expansion beyond 7 December.

#### Twelve openings and two victory scenes — decided 13 October 2026

Every campaign chapter receives one 10–20 second skippable in-engine opening that
establishes place, danger, and objective; A1 and J1 also introduce their campaign's
story. Ordinary chapters rely on debriefs and persistent headquarters/world changes
instead of ending cinematics. Only A6 and J6 receive full victory scenes, played
after the successful recovery and after the result is safely banked.

The American ending shows dawn over held airfields, returning aircraft, repairs,
unloading transports, and a secure fleet before a concise historical epilogue. The
Japanese ending shows a landing at captured Buri or Bayug, consolidation of the
fields, damaged Tacloban, and withdrawing American ships before an explicit
alternate-history epilogue naming the J5/J6 point of divergence.

#### Normal failure, explicit abandonment, and friendly fire — decided 13 October 2026

A score-eligible sortie that reaches its normal debrief banks legitimately earned
destruction points even when its primary objective or authored recovery fails. For
example, shooting down an enemy aircraft and returning to land without completing
the objective banks the aircraft's value, but earns no badge, campaign advancement,
roster bonus, difficulty bonus, or authored completion bonus. Bailout, ditching,
rescue, POW, and KIA likewise retain legitimate destruction points while remaining
mission failures unless the mission explicitly defines the outcome as valid
recovery.

Choosing the mid-sortie quit/abandon action is different: it records a zero-point
attempt, forfeits the entire sortie score, grants no completion-related award, and
still increments the adjusted-score sortie denominator. This prevents a player
from destroying easy targets and quitting to bank them.

Nonfatal friendly damage elicits an immediate warning but causes no numerical
penalty or discharge. Player-caused destruction of a friendly target dishonorably
discharges the assigned pilot, archives that dossier, invokes the normal
entry-rank replacement rule, and forfeits the sortie's points and completion
awards. The discharge is the conduct penalty; no separate negative score is added.

### 14.2 Foundational questions resolved

The foundational campaign questions identified during this brainstorm are now
resolved. Per-mission authored completion bonuses and exact content tuning remain
normal mission-definition and balance work rather than unresolved system design.

## 15. Proposed migration into the master plan

Do not copy this brainstorm wholesale into `MASTER_PLAN.md`. Turn the approved
portions into bounded tracks with
acceptance gates:

1. **Campaign definition and source lock:** final six-versus-six mission matrix,
   historical labels, night chapters, rank gates, orders of battle, time budgets,
   7 December endpoint and epilogues, site states, cutscene inventory, and one
   frozen reusable-asset inventory.
2. **Reusable asset production:** source, build, Library/Hangar-enroll, inspect,
   and attend-approve every required Blender asset, including Ki-57, parachute rig,
   vehicles, structures, and mission objects.
3. **Dev Flight Recorder:** implement the compact same-build deterministic record,
   export/import, headless checksum verification, in-game playback, corruption and
   mismatch handling, and measured performance gates before campaign test volume
   grows.
4. **Faction-bound campaign persistence:** versioned campaign index and independent
   American/Japanese save schema, migration from the old roster, fixed campaign
   rosters, archive/replacement rules, generated names, dossier screens,
   import/export, and autosave.
5. **Mission-first headquarters UI:** campaign/non-campaign/single/training
   selection, mission cards and locks, pilot assignment, authored
   conditions/loadout, and launch flow.
6. **Scoring and progression:** two score ledgers, objective rewards, target
   values, six pilot ranks, player command ratings, roster bonus, score-version
   metadata and points-per-sortie accounting for the future Wall of Fame, balance
   simulations, and counter-integrity tests.
7. **Night rendering and gameplay:** sky/exposure, moon/stars, local lights,
   aircraft/cockpit/runway/deck lighting, flares, visibility/AI, performance, and
   visual approval.
8. **Bailout, POW, and rescue:** simulation, parachute visuals, outcome resolver,
   debrief/roster integration, and shared paratrooper foundations.
9. **Canonical campaign world:** persistent base/port/beachhead layouts,
   construction/ownership/damage states, scenery, and attended visual approval.
10. **Cutscene framework:** authored camera/timeline actions, subtitles/radio,
    invariant skip behavior, bank-before-scene safety, twelve chapter openings,
    and the two approved victory sequences and epilogues.
11. **Campaign mission production:** implement and approve chapters in sequence,
     require primary-objective and authored-recovery success for progression, seed
     the existing scenarios as the non-campaign promotion pool, and enforce the 5–7
     minute action cap and the measured 24-aircraft/10-ship staged-finale envelope.
12. **Campaign validation and release:** full progression/loss/replacement runs,
     actual-scene finale performance, night accessibility, save migration,
     deterministic tests, browser/E2E coverage, balance review, and final
     `GAMEPLAY.md` reconciliation.

The corresponding `GAMEPLAY.md` rewrite should replace, rather than layer on top
of, the current resurrection-era sections for Roster, Rank, Starting a flight,
Scoring, Badges, and Persistence. It also needs new authoritative sections for
Campaign structure, Player profile, Pilot loss/replacement, Bailout/POW/rescue,
Night operations, mission-first selection, cutscenes, and campaign autosave. Keep
Single Missions and Training behavior explicitly separate wherever they retain
the current free-form setup.

