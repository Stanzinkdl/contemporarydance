// Plain-language explanations of each signature step: how it is done, and
// what to watch for. Shown under each pioneer in the studio.

export const MOVE_INFO = {
  // Shared
  plie2: { how: 'Feet wide and turned out, knees bend directly over the toes while the spine stays upright.', watch: 'Knees open in line with the feet; the pelvis lowers straight down.' },
  releve: { how: 'Rising onto the balls of the feet with the arms overhead, the whole body lifting upward.', watch: 'Heels lift but the toes stay flat on the floor.' },
  spiralStand: { how: 'Standing, the torso rotates around the spine, starting from the pelvis, with the arms wrapping around the body.', watch: 'The twist travels upward from the hips to the shoulders.' },

  // Graham
  gSeated: { how: 'Sitting with the soles of the feet together and knees open, the torso bounces forward over the legs in small, rhythmic pulses.', watch: 'The bounce comes from the lower back, not from pulling with the arms.' },
  gBreathContract: { how: 'On a sharp exhale the pelvis tucks under and the spine hollows into a deep C-curve, the head following.', watch: 'The curve starts at the base of the spine, like being hit in the stomach.' },
  gBreathRelease: { how: 'On the inhale the spine lengthens back up and the chest lifts and opens.', watch: 'The release rebuilds the spine from the bottom up.' },
  gSpiral: { how: 'Sitting in fourth position (one leg folded in front, one behind), the torso spirals around the spine towards the front leg.', watch: 'The back rises higher than the front as the body turns.' },
  gPleading: { how: 'Kneeling with the thighs vertical, the dancer contracts and leans back, arms reaching forward as if pleading.', watch: 'The thighs stay upright while the torso tips back from the knees.' },
  contraction: { how: "Standing with bent knees, the dancer performs Graham's contraction: pelvis under, spine hollowed, arms curving forward.", watch: 'The same movement as on the floor, now carrying the whole body weight.' },
  release: { how: 'From the contraction, the chest lifts high and the arms open wide in a diagonal.', watch: 'The upper back arches while the legs stay grounded.' },
  gSideFall: { how: 'From kneeling, the body slides sideways to the floor, one arm reaching along the ground overhead.', watch: 'The fall is controlled all the way, never dropped.' },
  gTripletL: { how: 'A travelling rhythm of three steps: one on a bent knee, then two on half-toe.', watch: 'Down–up–up: the body rises and falls like a wave.' },

  // Horton
  hFlatBack: { how: 'Hinging at the hips, the torso tips forward until it is horizontal, the arms reaching forward in line with the spine.', watch: 'The back stays straight as a table; the head stays in line with the spine.' },
  hLateral: { how: 'Standing in a wide stance, the torso bends sideways with one arm arcing overhead.', watch: 'A pure side bend: no twisting forward or back.' },
  hLateralT: { how: 'Balancing on one leg, the torso and the other leg tilt sideways until they form one horizontal line, arms extended beyond the head.', watch: 'Fingertips to foot form the top of a "T".' },
  hHinge: { how: 'On the balls of the feet with knees bent, the body leans back in a straight line from knees to head.', watch: 'No bend at the hips: thighs and torso move as one plank.' },
  hLunge: { how: 'A very deep lunge with the front knee bent and the back leg long, arms out to the sides.', watch: 'The torso stays upright over the hips.' },
  hSquat: { how: 'A deep squat with the feet flat and parallel, arms reaching forward.', watch: 'Heels stay on the floor; the spine stays long.' },
  hCoccyx: { how: 'Balancing on the tailbone with the legs and arms raised in a V shape.', watch: 'The body balances on a single point, with no hands on the floor.' },
  hProg: { how: 'Travelling lunges across the floor with the arms held out in a T.', watch: 'Long, horizontal lines through the arms while the legs travel.' },

  // Limón
  lSwingDown: { how: 'The torso drops forward and down from the hips, the arms swinging with the weight, knees softening.', watch: 'Gravity does the work: the body falls rather than bends.' },
  lSwingUp: { how: "The rebound of the swing carries the body up onto half-toe, the arms overhead, into a moment of suspension.", watch: 'The pause at the top before the next fall.' },
  lHeadDrop: { how: 'The head drops forward, letting its weight pull the upper spine into a curve.', watch: 'The head feels heavy; the spine follows it vertebra by vertebra.' },
  lFall: { how: 'The body tips sideways off balance, one arm flung up, a leg stepping out to catch the fall.', watch: 'The fall commits fully before the recovery begins.' },
  lRebound: { how: 'From the fall, the body springs back up onto half-toe with the chest lifted.', watch: 'Momentum from the fall powers the recovery.' },
  lSuccession: { how: 'A wave passes through the arms from shoulder to elbow to wrist to fingers.', watch: 'Each joint moves just after the one before it.' },
  lRun: { how: 'A running step that lifts into the air at the top of its arc.', watch: 'The suspension in the middle of the run.' },

  // Dunham
  dHipL: { how: 'With knees bent, the hips shift sideways on their own while the ribcage stays still.', watch: 'Only the pelvis moves: the chest stays centred.' },
  dRibL: { how: 'The ribcage slides sideways over still hips.', watch: 'The opposite of the hip isolation: the hips stay still.' },
  dShoulderL: { how: 'One shoulder lifts and drops on its own while the rest of the body stays still.', watch: 'The shoulder blade and collarbone move together.' },
  dWalkL: { how: 'A travelling walk with a high knee lift, the pelvis tilted and the arms bent, in rhythm with the drums.', watch: 'Hips and shoulders keep different rhythms as the body travels.' },
  dTendu: { how: 'At the barre, one foot slides out to the side to a pointed toe.', watch: 'Ballet placement in the legs, a released torso.' },

  // Cunningham
  cUpright: { how: 'Standing tall in first position with the legs turned out and the back straight.', watch: 'The starting point of all five back positions.' },
  cCurve: { how: 'The upper back curves forward while the legs stay straight and the hips stay over the feet.', watch: 'The curve is high in the back, not at the hips.' },
  cArch: { how: 'The upper back arches backward, chest lifted, arms opening to the side.', watch: 'Only the upper back arches; the lower back stays long.' },
  cTilt: { how: 'The torso tilts sideways while one leg lifts to the side, the arms held out to the sides.', watch: 'The body forms a straight diagonal line.' },
  cTwist: { how: 'The torso twists around the spine while the hips face front.', watch: 'Shoulders turn, hips stay square.' },
  cTendu: { how: 'One leg slides forward to a pointed foot, staying in contact with the floor.', watch: 'The fast, precise footwork Cunningham took from ballet.' },
  cDegage: { how: 'A quick brush of the leg off the floor to a low height, foot pointed.', watch: 'Speed and precision in the feet.' },
  cAttitude: { how: 'Balancing on one leg on half-toe, the other leg lifted behind with the knee bent, one arm overhead.', watch: 'A long, still balance.' },
  cJete: { how: 'A leap from one foot to the other, the legs split in the air.', watch: 'The body leaves the floor with both legs extended.' },

  // Butoh
  bGanimata: { how: 'A low stance with the knees bent and turned out, the weight sunk, the hands twisted and the fingers curled.', watch: 'The body looks compressed and earthbound.' },
  bWalkL: { how: 'An extremely slow walk in the low stance, each step taking many seconds.', watch: 'Slowness so extreme the body seems barely to move.' },
  bTransform: { how: 'The body slowly twists and reaches as it transforms into an image: an animal, a plant, smoke.', watch: 'The movement looks driven from outside, as if the body were being moved.' },
  bCollapse: { how: 'A slow descent to a curled crouch near the floor.', watch: 'Even the collapse is slow and controlled.' },
  bFlower: { how: 'The hands rise slowly overhead and open like a blooming flower.', watch: 'The fingers unfurl one by one.' },

  // Release
  rRest: { how: 'Lying on the back with the knees bent and the feet on the floor, letting the floor take all the weight.', watch: 'Nothing is held: the body is completely supported.' },
  rRollUp: { how: 'Sitting up from the floor by curling through the spine, one vertebra at a time.', watch: 'The rounded C-shape of the back as it rises.' },
  rSpiralUp: { how: 'A spiral from the floor into standing, using the turn of the torso to rise.', watch: 'No pushing: the spiral lifts the body.' },
  rSwing: { how: 'The torso drops forward from the hips with soft knees, the arms swinging with gravity.', watch: 'Released, heavy and easy.' },
  rReach: { how: 'A long diagonal reach with one arm while the weight shifts onto one leg.', watch: 'The reach extends from the fingertips through to the opposite foot.' },

  // Contact Improvisation
  ciSmallDance: { how: 'Standing still with eyes soft, noticing the tiny reflexive movements that keep the body balanced.', watch: 'Stillness is never truly still.' },
  ciLean: { how: 'Partners face each other and lean in, sharing weight through the shoulders and arms.', watch: 'Neither can stand without the other.' },
  ciCounter: { how: 'Partners hold hands and lean away from each other, each balancing the other\'s weight.', watch: 'Both sit back into the counterbalance.' },
  ciTable: { how: 'One partner goes onto hands and knees, making a flat, stable base: the "table".', watch: 'A strong, flat back to support the other dancer.' },
  ciOver: { how: "The other partner bends over and rides across the table's back.", watch: 'The point of contact rolls from one body to the other.' },
  ciRoll: { how: 'Rolling down to the floor and through it, ready to rise again.', watch: 'Falling as a skill, never a mistake.' },

  // Forsythe
  fPointLine: { how: 'Two points (here the hands) define an imagined line, which the body then follows and moves.', watch: 'The line is invisible; the body traces it.' },
  fInscribe: { how: 'The elbow draws a shape in the air, and the rest of the body follows.', watch: 'Any body part can draw, not just the hand.' },
  fExtrude: { how: 'A shape is pushed out into space as far as it will go, taking the body off balance.', watch: 'The body stretches beyond its usual range.' },
  fDropCurve: { how: 'An imagined curve falls through the body, which bends and yields where it passes.', watch: 'The body gives way along the curve.' },
  fPlane: { how: 'Both arms define a flat plane that rotates with the torso.', watch: 'The arms and shoulders move as one flat surface.' },

  // Flying Low
  flLow: { how: 'A low, wide stance close to the floor, the hands ready to touch the ground.', watch: 'The centre stays low.' },
  flSpiralDown: { how: 'A spiral that carries the body down to the floor without stopping.', watch: 'Continuous movement down through the levels.' },
  flRoll: { how: 'Rolling through the floor on the side of the body.', watch: 'The body passes through the floor rather than landing on it.' },
  flPush: { how: 'Pushing up from the floor with the hands into a low crouch.', watch: 'The rise is quick and efficient.' },
  flTravelL: { how: 'Travelling sideways low and fast, one leg bent and the other long.', watch: 'The head stays level while the body moves fast.' },

  // Gaga
  ggFloat: { how: 'Soft, continuous movement, as if the body were floating in water.', watch: 'There are no stops; the movement never ends.' },
  ggQuake: { how: 'Small, fast vibrations run through the whole body.', watch: 'Shaking releases tension and wakes up sensation.' },
  ggWaveA: { how: 'A wave travels up the spine, from the pelvis through the ribs to the head.', watch: 'The spine moves like a fluid chain.' },
  ggExplode: { how: 'A sudden, explosive reach of the arms and chest.', watch: 'Power that comes out of softness.' },
  ggMelt: { how: 'The body melts down into a low, soft crouch.', watch: 'Releasing everything at once.' },

  // Countertechnique
  ctScan: { how: 'Standing easily, the dancer scans the body for unnecessary tension and lets it go.', watch: 'Less tension, more space.' },
  ctSwing: { how: 'A weight shift to the side with a swing of the arms.', watch: 'The swing carries the weight, not the muscles.' },
  ctCounter: { how: 'The body tips off balance while the arms and head reach in the opposite direction.', watch: 'Every direction has a counter-direction.' },
  ctBigOff: { how: 'A large off-balance lunge, the arms reaching in opposite directions.', watch: 'Going far off balance without strain.' },

  // Wigman
  wTension: { how: 'The whole body gathers into tension: crouched, fists clenched, shoulders raised.', watch: 'Extreme tension held for a moment, ready to release.' },
  wRelax: { how: 'All the tension drops: the body folds forward, loose and heavy.', watch: 'The release is total.' },
  wReach: { how: 'A powerful diagonal reach into space, as if pushing against it.', watch: 'Space is something to struggle with.' },
  wTurnA: { how: 'Turning on the spot, the arms rising and the head lifting as the turn builds.', watch: 'The turn grows towards ecstasy.' },
  wWitch: { how: "From Wigman's Witch Dance: sitting on the floor, knees high and open, hands clawed, shoulders raised.", watch: 'Raw, earthbound and fierce.' },

  // Humphrey–Weidman
  hwBreath: { how: 'Rising onto half-toe on the inhale, the chest lifting and the arms floating up.', watch: 'The phrase follows the breath, not the count.' },
  hwWaterCurl: { how: 'From Water Study: kneeling, sitting back on the heels, curled forward over the knees.', watch: 'The body as a wave about to rise.' },
  hwWaterRise: { how: 'The wave rises: kneeling upright with the arms lifting overhead.', watch: 'Each dancer rises just after the one before.' },
  hwPantomime: { how: 'One hand to the chest, the other pointing away: stylised, expressive gesture.', watch: 'Gesture shaped and exaggerated, not realistic.' },

  // Hawkins
  hkSwing: { how: 'The arms swing forward freely with soft knees, nothing held.', watch: 'Free flow: the movement isn\'t blocked anywhere.' },
  hkPelvicWalk: { how: 'A walk led by the pelvis, which arrives just before the feet.', watch: 'The pelvis as the centre of movement.' },
  hkArc: { how: 'One arm traces a slow, wide arc overhead.', watch: 'An effortless, continuous curve.' },
  hkBalance: { how: 'A soft balance on half-toe with one knee raised, the arms rounded.', watch: 'Balance without gripping.' },

  // Nikolais / Louis
  nElbowLead: { how: 'The elbow leads the movement, pulling the shoulder and torso after it.', watch: 'The centre of movement is the elbow, not the torso.' },
  nKneeLead: { how: 'The knee lifts and leads, the body following it off centre.', watch: 'Any part of the body can be the centre.' },
  nShape: { how: 'Angular, sculptural arm shapes, like a figure carved in space.', watch: 'Angles and planes rather than emotion.' },
  nExpand: { how: 'The body expands to fill as much space as possible: arms and legs wide, fingers spread.', watch: 'The body as a volume that grows.' },
  nContract: { how: 'The body shrinks into the smallest possible shape.', watch: 'The opposite of expansion: the volume collapses.' },

  // Taylor
  tTilt: { how: 'A huge sideways tilt on one leg, the other leg and an arm stretched in one long diagonal.', watch: 'The whole body tilts as one line.' },
  tRun: { how: 'Running freely, the body almost airborne, arms swinging.', watch: 'Momentum carries the body.' },
  tFall: { how: 'A fall to the side that turns into a roll.', watch: 'The fall is part of the run, not a stop.' },
  tAureole: { how: 'Lyrical, open arms with a pointed foot in front, the chest lifted.', watch: 'Long phrases that sing with the music.' },

  // Klein
  kFloor: { how: 'Lying on the back, sensing deep support from the pelvic floor and deep hip muscles.', watch: 'Movement too small to see from outside.' },
  kAlign: { how: 'Quiet standing, finding the line from the sitting bones down through the heels.', watch: 'Support from the bones, not from tension.' },
  kRollDown: { how: 'Rolling down through the spine until the head hangs, then rolling up.', watch: 'One vertebra at a time.' },
  kRotation: { how: 'Turning the legs out from the deep rotators at the hip.', watch: 'Rotation comes from the hip, never from the knees or feet.' },
};
