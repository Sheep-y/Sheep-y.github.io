'use strict';
// Run this script with Node JS to generate ready to publish guides

const fs = require('fs'),
      flist = [ 'ac4/_balance.html', 'ac4/balance.html', 'ac4/madness.html',
                'img/jc/sage/_balance_abilities.svg', 'img/jc/sage/balance_abilities.svg', 'img/si/sorc/madness_abilities.svg',
                'img/jc/sage/_balance_rotation_lite.svg', 'img/jc/sage/balance_rotation_lite.svg', 'img/si/sorc/madness_rotation_lite.svg',
                'img/jc/sage/_balance_rotation_full.svg', 'img/jc/sage/balance_rotation_full.svg', 'img/si/sorc/madness_rotation_full.svg',
                'img/jc/sage/_balance_rotation_aoe.svg',  'img/jc/sage/balance_rotation_aoe.svg',  'img/si/sorc/madness_rotation_aoe.svg',
               ],
      [ dict, termList ] = buildMap();

for ( let i = 0, len = flist.length ; i < len ; i += 3 ) {
   fs.readFile( flist[i], 'utf8', ( err, data ) => {
      if ( err ) throw err;
      data = normalise( data );
      const [ pub, pubinfo ] = convertToPub( data );
      fs.writeFile ( flist[i+1], build( pub ), ( err ) => {
         if ( err ) throw err;
         console.log( `[R] Built: ${flist[i+1]} ${pubinfo}` );
      } );
      const [ imp, impinfo ] = convertToImp( data );
      fs.writeFile ( flist[i+2], build( imp ), ( err ) => {
         if ( err ) throw err;
         console.log( `[I] Built: ${flist[i+2]} ${impinfo}` );
      } );
   } );
}

/* Turn text into id */
function idify ( text ) {
   return text.replace( /\([^)]+\)/, "" ).trim().toLowerCase().replace( /\W+/g, '_' );
}

/* Sort string by length, longest first */
function revLenSort (a,b) {
   const al = a.length, bl = b.length;
   if ( al != bl ) return bl - al;
   return a > b ? 1 : ( a === b ? 0 : -1 );
}

/* Removes whitespaces and comments, and convert list to details block */
function normalise ( data ) {
   // Remove inkscape props
   if ( data.startsWith( "<?xml " ) ) {
      data = data.replace( /(inkscape|sodipodi):[^= "]+=\"[^"]*\"/g, "" ); // Remove inkscape propterties
      data = data.replace( /-inkscape-[^;"]+;/g, "" ); // Custom inkscape CSS
      data = data.replace( / xmlns:(inkscape|sodipodi)="[^"]+"/g, "" ); // Remove xml namespaces
      // Find and remove unused ids
      const ids = data.match( /\(#[^)]+\)"/g ).map( id => id.slice( 2, -2 ) ).sort();
      const regxId = new RegExp( ` id="(?!${ids.join("|")})[^"]+"`, "g" );
      data = data.replace( regxId, "" );
      // Fix svg links
      data = data.replace( /xlink:href/g, 'href' );
   }

   // Turns to one line
   data = data.replace( /\s*[\r\n]+\s*/g, " " );
   // Drop comments
   data = data.replace( /\/\*.*?\*\//g, "" ).replace( /<!--.*?-->/g, "" );
   // Drop spaces between and within tags
   data = data.replace( />\s+</g, '><' ).replace( / \/>/g, '/>' );
   // Minor trims
   data = data.replace( /  +>/g, " " );

   // Set build time
   data = data.replace( /\$DATE_BUILD/g, new Date().toISOString().split( /T/ )[0] );
   if ( ! data.includes( '<p>' ) ) {
      data = data.replace( /font-(stretch|style|variant|weight):normal;/g, "" );
      data = data.replace( /<sodipodi:namedview\b.*?<\/sodipodi:namedview>/g, "" );
      data = data.replace( /<metadata\b.*?<\/metadata>/g, "" );
      return data;
   }

   // Fix multiline sentences
   data = data.replace( /\.(?=[A-Z])/g, ". " );

   // Convert number range to ruby
   data = data.replace( /<data value="(\d+)">[^<]+<\/data>/g, ( match, v ) => {
      return `<span title="${v}">${+((+v).toPrecision(3))}</span>`;
   } );
   data = data.replace( /<data value="(\d+)-(\d+)">[^<]+<\/data>/g, ( match, a, b ) => {
      const min = +a, max = +b, avg = ( min + max ) / 2, deviation = Math.min( avg-min, max-avg );
      return `<span title="${min} – ${max}">${+(avg.toPrecision(3))}<small> ±${+(deviation.toPrecision(2))}</small></span>`;
   } );

   // Convert list to <details>
   data = data.replace( /(<[ou]l class="desc)/g , '<details open="open" class="leaf"><summary>Description</summary>$1' );
   data = data.replace( /(<[ou]l class="key)/g  , '<details open="open" class="leaf"><summary>Basics</summary>$1' );
   data = data.replace( /(<[ou]l class="use)/g  , '<details open="open" class="leaf"><summary>Usages</summary>$1' );
   data = data.replace( /(<[ou]l class="note)/g , '<details open="open" class="leaf"><summary>Notes</summary>$1' );
   
   data = data.replace( /(<[ou]l class="vgood)/g, '<details open="open" class="leaf"><summary class="vgood">Recommended</summary>$1' );
   data = data.replace( /(<[ou]l class="good)/g , '<details open="open" class="leaf"><summary class="good">Good</summary>$1' );
   data = data.replace( /(<[ou]l class="maybe)/g, '<details open="open" class="leaf"><summary class="maybe">Situational</summary>$1' );
   data = data.replace( /(<[ou]l class="bad)/g  , '<details open="open" class="leaf"><summary class="bad">Bad</summary>$1' );
   
   data = data.replace( /(<[ou]l summary="([^"]+)")/g, '<details open="open" class="leaf"><summary>$2</summary>$1' );
   data = data.replace( /<\/ul>/g, '</ul></details>' );
   data = data.replace( /<\/ol>/g, '</ol></details>' );

   return data;
}

/* Convert headers to details and build ToC */
function build ( data ) {
   if ( ! data.includes( '<p>' ) ) return data;

   const header = /<h(\d)([^>]*)>([^<]+)<\/h\1>/g, idProp = / id="([^"]+)"/;

   // Scan ToC, before headers are converted
   let tag, hlist = [];
   while ( tag = header.exec( data ) )
      if ( tag[1] !== "1" )
         hlist.push( tag );

   // Fill in id to all headers
   hlist = hlist.map( ([ header, lv, prop, title ]) => {
      let id = idProp.exec( prop );
      title = title.trim();
      if ( ! id ) {
         id = idify( title );
         data = data.replace( header, `<h${lv} id="${id}"${prop}>${title}</h${lv}>` );
      } else
         id = id[1];
      return [ lv, id, prop, title ];
   } );

   // Convert each header to <details>
   let end = data.indexOf( "</article>" );
   for ( let hlv = 6 ; hlv >= 2 ; hlv-- ) {
      const hx = new RegExp( `<h${hlv}([^>]*)>(.*?)<\/h${hlv}>` ),
               next = new RegExp( "<(h[" + "654321".slice( 6-hlv ) + "]|/section|/article)" );
      while ( tag = hx.exec( data ) ) {
         const { 0: txt, 1: props, 2: title, index: pos } = tag,
                  endPos = pos + txt.length + next.exec( data.slice( pos + txt.length ) ).index;
         //console.log( `${txt}: ${pos} to ${endPos} ${data.slice(pos,endPos)}` );
         data = data.slice( 0, endPos ) + "</details>" + data.slice( endPos );
         data = data.slice( 0, pos ) + `<details h="h${hlv}"${props} open="open"><summary>${title.trim()}</summary>` + data.slice( pos + txt.length );
      }
   }

   // Put headers into tree structure
   let level = 2, current = [], hstack = [];
   for ( let [ lv, id, prop, title ] of hlist ) {
      if ( lv > level ) {
         hstack.push( current );
         current = current[ current.length - 1 ].subs = [];
      } else if ( lv < level ) {
         while ( level-- > lv ) current = hstack.pop();
      }
      if ( prop ) prop = prop.replace( / ?id=['"][^'"]*['"]/, "" );
      current.push( { h: `<a href="#${id}"${prop}>${title}</a>`, lv: lv, subs: null } );
      level = lv;
   }
   while ( level-- > 2 ) current = hstack.pop();

   // Build ToC from tree
   function buildToC( item ) {
      if ( item.subs ) {
         let html = '<li><details';
         if ( item.lv == 2 ) html += ' open="open"';
         html += `><summary>${item.h}</summary><ul>`;
         for ( const e of item.subs ) html += buildToC(e);
         return html + "</ul></details></li>";
      } else
         return `<li>${item.h}</li>`;
   }
   const toc = "<ul>" + current.map( buildToC ).join("") + "</ul>";

   // ToC replace
   data = data.replace( '<p class="TOC"></p>', toc );

   // Count open and close tags
   const open = /<(\w+)(?![^>]*\/>)/g, close = /<\/(\w+)/g, tags = new Map();
   while ( tag = open.exec( data ) ) tags.set( tag[1], ~~tags.get( tag[1] ) + 1 );
   while ( tag = close.exec( data ) ) tags.set( tag[1], ~~tags.get( tag[1] ) - 1 );
   for ( const tag of tags ) if ( tag[1] ) console.warn( `Orphan ${tag[0]} ${tag[1]>0?'open':'close'} tag` );

   return data;
}

/* Turns pub side template into final form */
function convertToPub ( data ) {
   data = data.replace( /<(\w+) class="imp"[^>]*(\/>|>.*?<\/\1>)/g, "" );
   return [ data, `(${Number(data.length).toLocaleString()} bytes)` ];
}

/* Turns pub side template into imp form */
function convertToImp ( data ) {
   data = data.replace( /<(\w+) class="pub"[^>]*(\/>|>.*?<\/\1>)/g, "" );
   let result = "", pos = 0, sectionCount = 0;
   while ( true ) {
      const match = data.slice( pos ).match( /<(\w+) class="imp"/ );
      let end = match ? pos + match.index : data.length;
      //console.log( `[${pos},${end}]: ${data.slice(pos,end)}` );
      // Translate non-imp part
      let part = data.slice( pos, end );
      for ( const e of termList ) {
         const [ from, to ] = dict.get( e );
         part = part.replace( from, to );
      }
      result += part;
      ++sectionCount;
      if ( end >= data.length ) break;
      // Copy imp part
      pos = end;
      end = data.slice( pos ).match( new RegExp( `^[^>]*/>|</${match[1]} ?>` ) );
      end = end ? pos + end.index + end[0].length : data.length;
      result += data.slice( pos, end );
      // Move forward
      pos = end;
   }
   return [ result, `(${Number(result.length).toLocaleString()} bytes, ${sectionCount} sections)` ];
}

/* Build translation map and list */
function buildMap () {
   const map = [];

   // Class
   map.push(
      "Jedi", "Sith",
      "Republic", "Imperial",
      "Jedi Knight", "Sith Warrior",
         "Guardian", "Juggernaut",
         "Sentinel", "Marauder",
      "Jedi Consular", "Sith Inquisitor",          "data-sprite=\"jc-", "data-sprite=\"si-",
         "Shadow", "Assassin",
         "Sage", "Sorcerer",                       "data-sprite=\"sage-", "data-sprite=\"sorc-",
            "Seer", "Corruption",
            "Telekinetic", "Lightning",
            "Balance", "Madness",
      "Smuggler", "Imperial Agent",
         "Gunslinger", "Sniper",
         "Scoundrel", "Operative",
      "Trooper", "Bounty Hunter",
         "Vanguard", "Power Tech",
         "Commando", "Mercenary",
   );

   // Sage / Sorcerer
   map.push(
      // Attacks
      "Telekinetic Throw", "Force Lightning",      "Vanquish", "Demolish",
      "Sever Force", "Creeping Terror",            "Weaken Mind", "Affliction",
      "Force in Balance", "Death Field",           "Force Serenity", "Force Leach",
      "Disturbance", "Lightning Strike",           "Project", "Shock",
      "Force Quake", "Force Storm",                "Mind Crush", "Crushing Darkness",
      // Controls
      "Force Lift", "Whirlwind",                   "Force Stun", "Electrocute",
      "Force Wave", "Overload",                    "Mind Snap", "Jolt",
      // Heals
      "Force Armor", "Static Barrier",             "Force Mend", "Unnatural Preservation",
      "Rejuvenate", "Resurgense",                  "Benevolence", "Dark Heal",
      "Restoration", "Expunge",                    "Revival", "Reanimation",
      "Meditation", "Seethe",
      // Buff & Utils
      "Force Valor", "Mark of Power",              "Mental Alacrity", "Polarity Shift",
      "Force Potency", "Recklessness",             "Force Empowerment", "Unlimited Power",
      "Vindicate", "Consuming Darkness",           "Force of Will", "Unbreakable Will",
      "Rescue", "Extrication",
      // Passives
      "Rippling Force", "Lightning Burns",
      "Resonant Pulse", "Dark Echo",
      // Skillful
      "Psychic Suffusion", "Force Suffusion",      "Jedi Resistance", "Sith Defiance",
      "Tectonic Master", "Tempest Mastery",        "Pain Bearer", "Empty Body",
                                                   "Benevolent Haste", "Dark Speed",
      // Masterful
      "Blockout", "Supression",                    "Mind Ward", "Corrupted Flest",
      "Valiance", "Dark Resilience",               "Confound", "Conspiring Force",
      "Telekinetic Defense", "Lightning Barrier",  "Staggering Stratagem", "Torturous Tactics",
      // Heroic
      "Egress", "Emersion",                        "Mental Defense", "Shapeless Spirit",
      "Metaphysical Alacrity", "Surging Speed",    "Kinetic Collapse", "Backlash",
      "Containment", "Haunted Dreams",             "Force Wake", "Electric Bindings",
      // Legendary
                                                   "Swift Rejuvenation", "Galvanizing Cleanse",
      "Life Ward", "Corrupted Barrier",            "Valorous Spirit", "Unnatural Vigor",
      "Ethereal Entity", "Shifting Silhouette",    "Impeding Slash", "Enfeebling Strike",
      // Short names
      "skittles", "lightnings" );

   // Vanguard / Powertech
   map.push(
      "Transpose", "Translocate"
      );

   const dict = new Map(), list = [];
   for ( let i = 0, len = map.length ; i < len ; i += 2 ) {
      const p = map[i], e = map[i+1], pid = '#'+idify(p), eid = '#'+idify(e);
      dict.set( p  , [ new RegExp( `\\b${p}(?!</a>)\\b`  , 'g' ), e ] );
      dict.set( pid, [ new RegExp( `${pid}\\b`, 'g' ), eid ] );
      list.push( p, pid );
   }
   list.sort( revLenSort );
   return [ dict, list ];
}