#import "db-func.typ": *

#set text(11pt)
#cetz.canvas({
  import cetz.draw: *
 
  relation((rel: (0, -2)), "USER", ("User_id", "Name", "Email", "Sex", "Password", "Phone", "Register_time"), keys: (0,))
  relation((rel: (0, -2)),  "ADMIN_USER", ("User_id",), keys: (0,))

  relation((rel: (0, -2)), "GROUP", ("Group_id", "Name"), keys: (0,))
  
  relation((rel: (0, -2)), "TYPE", ("name",), keys: (0,))
  relation((rel: (0, -2)), "PREFERENCE", ("User_id", "Priority", "Type_name"), keys: (0,1,))
  relation((rel: (0, -2)), "USER_GROUP", ("User_id", "Group_id"), keys: (0,1))
  relation(
    (rel: (0, -2)),
    "EVENT", ("Event_id", "Owner_id", "Group_id", "Type_name", "Need_book", "Title", "Content"),
    keys: (0,),
  )
  relation(
    (rel: (0, -1.5)),
    "", ("Capacity", "Location_desc", "Start_time", "End_time", "Status", "Created_at"),
    keys: (),
  )  
  relation((rel: (0, -2)),  "JOIN_RECORD", ("Event_id", "User_id", "Join_time", "Status"), keys: (0, 1))

  relation((rel: (0, -2)),  "VENUE", ("Venue_id", "Name", "Building", "Floor", "Capacity", "Open_time", "Close_time", "Status"), keys: (0,))

  relation((rel: (0, -2)),  "VENUE_BOOKING", ("Event_id", "Venue_id", "Book_datetime"), keys: (0, ))  


  foreign-key(..("ADMIN_USER.User_id", "USER.User_id"), 4)
  foreign-key(..("PREFERENCE.User_id", "USER.User_id"), 7,
  ref-displacement: (-0.2, -0.1) )   
  foreign-key(..("USER_GROUP.User_id", "USER.User_id"), 7.5,
  ref-displacement: (-0.4, -0.2) )        
  foreign-key(..("JOIN_RECORD.User_id", "USER.User_id"), 15,
  ref-displacement: (0.2, -0.3) )       
  foreign-key(..("EVENT.Owner_id", "USER.User_id"), 16,
  ref-displacement: (0.4, -0.4) ) 


  foreign-key(..("USER_GROUP.Group_id", "GROUP.Group_id"), 8,
    key-displacement: (-0.0, -0.1),
    ref-displacement: (-0.2, -0.1),)      
  foreign-key(..("EVENT.Group_id", "GROUP.Group_id"), 16.5,
    key-displacement: (-0.0, -0.1)) 

  foreign-key(..("PREFERENCE.Type_name", "TYPE.name"), 8.5,
    ref-displacement: (-0.2, -0.1),
    key-displacement: (-0.0, -0.1))            
  foreign-key(..("EVENT.Type_name", "TYPE.name"), 15.5,
    key-displacement: (-0.0, -0.2))   

  foreign-key(..("JOIN_RECORD.Event_id", "EVENT.Event_id"), 16,
    ref-displacement: (0.0, -0.1),
    key-displacement: (-0.0, -0.1))     
  foreign-key(..("VENUE_BOOKING.Event_id", "EVENT.Event_id"), 16.5,
    ref-displacement: (0.2, -0.2),
    key-displacement: (-0.0, -0.0))

  foreign-key(..("VENUE_BOOKING.Venue_id", "VENUE.Venue_id"), 8,
    ref-displacement: (0.2, -0.2),
    key-displacement: (-0.0, -0.1))     
})
