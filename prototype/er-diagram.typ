#import "@preview/cetz:0.4.2"
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge, shapes

#set scale(reflow: true)
#set text(size: 11pt)

#let user-attr = (underline[uid], [role], [name], [mail], [password], [phone])
#let event-attr = (underline[eid], [title], [content], [start_t], [end_t], [capacity], [location], [need_booking])
#let group-attr = (underline[gid], [name])
#let vanue-attr = (underline[vid], [open_hours], [room], [status],[building],  [capacity])

#diagram(
  node-stroke: 1pt,
  node-inset: 0.7em,
  edge-stroke: 1pt,
  label-sep:0.1em,
  spacing: (2em, 0.5em),
  node((4, 5), [EVENT], name: <event>),
  node((0, 0), [USER], name: <user>),
  node((4, -5), [PREFERENCE_TYPE], name: <preference>),
  node((0, 14), [GROUP], name: <group>),
  node((rel: (0, 12), to: <event>), [VENUE], name: <venue>),
  
  node((2, -5), [HAS], shape: shapes.diamond,name: <has>),
  edge(<has>, "-", <user>, label: [N], right),
  edge(<has>, "-", <preference>, label: [M], left),
  
  node((2, 1), [JOIN], shape: shapes.diamond,name: <join>),
  edge(<join>, "-", <user>, label: [N], right),
  edge(<join>, "-", <event>, label: [M], left),
  
  node((2, 4), [CREATE], shape: shapes.diamond,name: <create>),
  edge(<create>, "-", <user>, label: [N], right),
  edge(<create>, "-", <event>, label: [1], left),
  
  node((4, -0), [WITHIN], shape: shapes.diamond,name: <within>),
  edge(<within>, "-", <preference>, label: [N], right),
  edge(<within>, "-", <event>, label: [M], left),
  
  node((0, 6), [IN], shape: shapes.diamond,name: <in>),
  edge(<in>, "-", <user>, label: [N], right),
  edge(<in>, "-", <group>, label: [M], left),
  
  node((rel: (2, 1), to: <in>), [BOOK], shape: shapes.diamond,name: <can_join>),
  edge(<can_join>, "-", <group>, label: [N], right),
  edge(<can_join>, "-", <event>, label: [M], left),
  
  node((rel: (0, 6), to: <event>), [BOOK], shape: shapes.diamond,name: <book>),
  edge(<book>, "-", <event>, label: [N], right),
  edge(<book>, "-", <venue>, label: [M], left),
  
  for (i, attr) in user-attr.enumerate() {
    node((rel: (i * 23deg + 100deg, 7.5em), to: <user>), attr, shape: shapes.ellipse)
    edge((), "-", <user>)
  },
  for (i, attr) in event-attr.enumerate() {
    node((rel: (-i * 15deg + 56deg, 10em), to: <event>), attr, shape: shapes.ellipse)
    edge((), "-", <event>)
  },
  for (i, attr) in vanue-attr.enumerate() {
    node((rel: (i * 33deg + 190deg, 6.5em), to: <venue>), attr, shape: shapes.ellipse)
    edge((), "-", <venue>)
  },
  node((rel: (155deg, 4em), to: <has>), [priority], shape: shapes.ellipse),
  edge((), "-", <has>),
  node((rel: (35deg, 5em), to: <preference>), [#underline[name]], shape: shapes.ellipse),
  edge((), "-", <preference>),
  for (i, attr) in group-attr.enumerate() {
    node((rel: (i * 30deg + 180deg, 5em), to: <group>), attr, shape: shapes.ellipse)
    edge((), "-", <group>)
  },
)

