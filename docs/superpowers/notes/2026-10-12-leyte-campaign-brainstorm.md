# Leyte campaign mission brainstorm

**Status:** brainstorming draft, not an approved design or implementation plan  
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
- Existing scenarios remain available as **Single Missions** or **Training
  Grounds**. Campaign scenarios may reuse their systems and arrangements, but
  should have campaign-specific dates, base states, briefings, radio traffic, and
  outcomes.

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
**Target time to action:** 5–6 minutes including water takeoff

**Where the player starts**

Afloat at the San Pedro Bay seaplane anchorage. The aircraft taxis onto the step,
takes off, and flies 8–10 miles to the last reported position of a downed crew.
The search area is small enough that the player begins looking for smoke, dye, or
a flare by the fifth minute.

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

Afloat inside the marked San Pedro Bay anchorage, engines stopped after the rescue
launch reaches the Catalina.

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

**Enemies**

- Ki-43 Oscars and A6M2 Zeros
- Ki-21 Sally and G4M Betty bombers
- Japanese transport aircraft; a Ki-57 model would be preferable to a false bomber
  stand-in
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

### J4. Ormoc Lifeline

**Date and label:** 9 November 1944 — historical composite  
**Player aircraft:** A6M2 Zero  
**Mission type:** convoy air cover / escort  
**Target time to action:** 1–2 minutes

**Where the player starts**

Airborne over a Japanese convoy entering Ormoc Bay. Radar or observers have just
reported American aircraft approaching from the east.

**Mission objective**

Keep at least two troop transports afloat until they complete a timed unloading
phase. The player must remain close enough to disrupt bombing runs rather than
chasing escorts. A secondary objective protects the flagship destroyer.

**Friendlies**

- two or three Type B Maru transports
- Kagero- and Shiratsuyu-class destroyer escorts
- one Zero wingman
- shore AAA and warehouses at Ormoc

**Enemies**

- P-38 Lightnings with bombs
- TBM Avengers standing in for part of the wider American strike effort
- an American fighter escort element

**Where the player is supposed to end up**

At a western safe-egress boundary once unloading completes, or at Buri after a
compressed 5–7 minute return if the field remains Japanese-controlled in this
campaign branch.

**Historical blurb**

Japan used a succession of convoys to reinforce Leyte through Ormoc Bay. On 9–10
November a convoy carrying the 26th Division was attacked first near Ormoc and
again after unloading; low-level B-25 strikes suffered serious losses but sank
transports and escorts. This scenario gives the convoy representative fighter
cover to create an escort mission; it does not claim that this exact Zero element
was present. See the Army Air Forces account,
[The Pacific: Guadalcanal to Saipan](https://www.ibiblio.org/hyperwar/AAF/V/AAF-V-12.html).

### J5. Destroyers in the Bay

**Date and label:** early December 1944 — historical composite  
**Player aircraft:** B5N2 Kate with torpedo  
**Mission type:** torpedo attack inside a ship-to-ship engagement  
**Target time to action:** less than 2 minutes

**Where the player starts**

Airborne west of Ormoc Bay as Japanese destroyers engage an American destroyer
group. The gun battle is already visible; the player begins far enough out to set
up one deliberate torpedo run.

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

### J6. Operation Te-Go

**Date and label:** 6–7 December 1944 — alternate-history finale  
**Player aircraft:** Ki-43 Oscar or A6M2 Zero with a bomb  
**Mission type:** large bombing, escort, and dogfight finale  
**Target time to action:** 2–3 minutes

**Where the player starts**

Airborne west of the Burauen fields beside the first bomber and transport wave.
The player is close enough to see the target area but still has time to choose
between protecting the formation and suppressing American fighters.

**Mission objective**

The finale unfolds in waves:

1. Escort bombers and transports to Bayug, Buri, and San Pablo.
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
- Japanese transport aircraft; a Ki-57 model is preferable
- landed airborne troops, Type 97 tanks, cars, and supply objects
- Japanese AAA activated at captured fields during the final phase

**Enemies**

- multiple P-38 elements, introduced in waves rather than one giant furball
- American AAA at each operational field
- parked American aircraft, fuel, ammunition, and radio facilities
- M4 Sherman tanks and support vehicles counterattacking near the strips

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

## 5. Other enabling objects and mechanics

These are not base-layout requirements, but the proposed missions expose them:

- moving road columns with route following, spacing, stopping/scattering behavior,
  and mission-visible survival counts
- truck, artillery, and command-vehicle objects beyond the existing tank, jeep/car
  types
- survivor/raft pickup state and Catalina rescue dwell logic
- a Japanese Ki-57 transport or another honestly labeled transport model for the
  finale
- landing craft and a seaplane tender/rescue launch if they are to be more than
  distant scenery
- staged formation waves so the finales feel large without keeping every aircraft
  in the expensive active-combat set for the entire mission
- campaign-owned persistent site state: owner, readiness, construction phase, and
  destroyed structure ids, all applied to one canonical layout per site
- night operations, which are not supported by the current morning/noon/dusk
  environment set: add a true night time state and establish readable night sky,
  terrain/water, aircraft, cockpit, runway/deck, navigation, tracer, fire, and
  target lighting; reconcile exposure and AI/target visibility; and add visual,
  mission, and automated-test checkpoints. The final mission set must contain at
  least one American and one Japanese night campaign mission so the Lieutenant
  (junior grade) rank gate has authored campaign content. Either night mission may
  adapt an otherwise approved campaign candidate rather than add another chapter;
  choose the candidates during the final historical and mission-flow pass.

## 6. Decision log for the eventual design spec

### 6.1 Decided

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
Repeatable side missions remain available without advancing the campaign so the
player can earn points and promote surviving or replacement pilots until someone
is eligible for the next campaign mission.

The human player and the pilots are separate records:

- The human player retains cumulative points, player rank, campaign progress,
  mission badges, and aggregate results. For now, player rank is prestige only
  and unlocks no command abilities.
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

| Tier | American rank | Japanese rank | Newly eligible mission class |
|---:|---|---|---|
| 1 | Ensign | Kaigun Shōi | Daytime, single-engine missions |
| 2 | Lieutenant (junior grade) | Kaigun Chūi | Night missions |
| 3 | Lieutenant | Kaigun Taii | Multi-engine aircraft |
| 4 | Lieutenant Commander | Kaigun Shōsa | Bombsight and torpedosight |
| 5 | Commander | Kaigun Chūsa | Leads coordinated operations containing multiple formations or aircraft types |
| 6 | Captain | Kaigun Taisa | Eligible to fly the campaign finale |

The Lieutenant Commander's ordnance sights are rank-gated information aids, not
separate qualifications. With bombs selected, the bombsight marks the predicted
ground impact point for a release at that instant. With a torpedo selected, the
torpedosight shows the current water-entry/intercept solution and whether the
aircraft is inside the valid release envelope. Each prediction uses current
aircraft, weapon, and target motion; it does not anticipate later target evasion
or remove normal weapon dispersion. Lower-ranked pilots may still release either
weapon, but receive no predicted solution.

This replaces an automatic qualified-replacement safeguard: if no living pilot
meets the next campaign mission's requirement, the player uses side missions to
develop one. Every campaign must therefore retain accessible entry-rank side
missions, and their promotion pacing must not turn recovery from pilot loss into
an excessive grind.

Directly purchasing pilot promotions is only a distant possible freemium feature,
not part of the initial campaign design. The initial progression must be balanced
around earning every promotion through play and must not manufacture grind in
anticipation of monetization.

### 6.2 Open questions

1. Must every primary objective succeed before the next chapter unlocks, or may a
   failed result advance into a less favorable authored state?
2. Is the Catalina rescue a required pacing chapter or an optional sortie?
3. Should carrier and airfield landings remain mandatory for campaign credit, or
   should a safe egress complete missions whose historical home base is outside the
   playable world?
4. How many simultaneous nearby aircraft qualifies as the desired "large" finale
   after performance and AI-behavior measurements?
5. Does the campaign stop after 7 December, or later extend through the capture of
   Ormoc and Tanauan becoming operational?

