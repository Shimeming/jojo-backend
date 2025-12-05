#set table(
  stroke: none,
  align: horizon + left,
)
#set table.hline(stroke: 0.5pt)

#show figure: it => {
  set text(10.5pt)
  it
}

#let data-dict-headers = ([欄位名稱], [含義], [資料類型], [鍵屬性], [約束條件], [定義域])

// --- 1. USER 表 ---
`USER`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [User_id], [使用者唯一識別碼], [BIGINT], [PK], [Not Null], [],
  [Name], [使用者姓名], [VARCHAR(100)], [], [Not Null], [],
  [Email], [使用者電子郵件地址], [VARCHAR(255)], [], [Not Null, Unique], [NTU 校內信箱格式],
  [Sex], [性別], [VARCHAR(10)], [], [Not Null], ['Male', 'Female', 'Other'],
  [Password], [加密後密碼], [VARCHAR(255)], [], [Not Null], [],
  [Phone], [電話號碼], [VARCHAR(20)], [], [Not Null, Unique], [],
  [Register_time], [註冊時間], [TIMESTAMP], [], [Not Null], [],
  table.hline(),
)

// --- 2. ADMIN_USER 表 ---
`ADMIN_USER`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [User_id], [管理員使用者 ID], [BIGINT], [PK, FK: USER(User_id)], [Not Null], [],
  table.hline(),
)


// --- 3. GROUP 表 ---
`GROUP`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [Group_id], [群組唯一識別碼], [BIGINT], [PK], [Not Null], [],
  [Name], [群組名稱 (系所/社團/宿舍)], [VARCHAR(100)], [], [Not Null, Unique], [],
  table.hline(),
)

// --- 4. TYPE 表 ---
`TYPE`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [name], [活動類別名稱], [VARCHAR(50)], [PK], [Not Null, Unique],
  table.hline(),
)


// --- 5. USER_GROUP 表 ---
`USER_GROUP`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [User_id], [使用者 ID], [BIGINT], [PK, FK: USER(User_id)], [Not Null], [],
  [Group_id], [群組 ID], [BIGINT], [PK, FK: GROUP(Group_id)], [Not Null], [],
  table.hline(),
)


// --- 6. EVENT 表 ---
`EVENT`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [Event_id], [活動唯一識別碼], [BIGINT], [PK], [Not Null], [],
  [Owner_id], [活動主辦人 ID], [BIGINT], [FK: USER(User_id)], [Not Null], [],
  [Group_id], [限定群組 ID], [BIGINT], [FK: GROUP(Group_id)], [Null], [若為公開活動則為 NULL],
  [Type_name], [活動類型名稱], [VARCHAR(50)], [FK: TYPE(name)], [Not Null], [],
  [Need_book], [是否需要場地預定], [BOOLEAN], [], [Not Null], [True, False],
  [Title], [活動標題], [VARCHAR(100)], [], [Not Null], [],
  [Content], [活動內容描述], [TEXT], [], [Not Null], [],
  [Capacity], [活動人數上限], [INTEGER], [], [Not Null], [$>0$],
  [Location_desc], [活動地點描述 (非場地 ID)], [VARCHAR(255)], [], [Not Null], [],
  [Start_time], [活動開始時間], [TIMESTAMP], [], [Not Null], [],
  [End_time], [活動結束時間], [TIMESTAMP], [], [Not Null], [End_time > Start_time],
  [Status], [活動狀態], [VARCHAR(20)], [], [Not Null], ['Open', 'Closed', 'Cancelled'],
  [Created_at], [活動建立時間], [TIMESTAMP], [], [Not Null], [],
  table.hline(),
)


// --- 7. JOIN_RECORD 表 ---
`JOIN_RECORD`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [Event_id], [活動 ID], [BIGINT], [PK, FK: EVENT(Event_id)], [Not Null], [],
  [User_id], [使用者 ID], [BIGINT], [PK, FK: USER(User_id)], [Not Null], [],
  [Join_time], [報名時間], [TIMESTAMP], [], [Not Null], [],
  [Status], [參加狀態], [VARCHAR(20)], [], [Not Null], ['confirmed', 'pending', 'rejected', 'cancelled'],
  table.hline(),
)


// --- 8. VENUE 表 ---
`VENUE`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [Venue_id], [場地唯一識別碼], [BIGINT], [PK], [Not Null], [],
  [Name], [場地名稱], [VARCHAR(100)], [], [Not Null], [],
  [Building], [場地所在建築物], [VARCHAR(100)], [], [Not Null], [],
  [Floor], [樓層], [INTEGER], [], [Not Null], [],
  [Capacity], [場地容納人數], [INTEGER], [], [Not Null], [$>0$],
  [Open_time], [每日開放時間], [TIME], [], [Not Null], [],
  [Close_time], [每日關閉時間], [TIME], [], [Not Null], [Close_time > Open_time],
  [Status], [場地狀態], [VARCHAR(20)], [], [Not Null], ['Available', 'Maintenance'],
  table.hline(),
)


// --- 9. VENUE_BOOKING 表 ---
`VENUE_BOOKING`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [Event_id], [活動 ID (預約主鍵)], [BIGINT], [PK, FK: EVENT(Event_id)], [Not Null], [],
  [Venue_id], [借用場地 ID], [BIGINT], [FK: VENUE(Venue_id)], [Not Null], [],
  [Book_datetime], [場地預約時間], [TIMESTAMP], [], [Not Null], [],
  table.hline(),
)
#figure.caption[VENUE_BOOKING 表：儲存借用場地的相關資訊。]

// --- 10. PREFERENCE 表 ---
`PREFERENCE`
#table(
  columns: 6,
  table.hline(),
  table.header(..data-dict-headers),
  table.hline(),
  [User_id], [使用者 ID], [BIGINT], [PK, FK: USER(User_id)], [Not Null], [],
  [Priority], [偏好優先順序], [INTEGER], [PK], [Not Null], [$1, 2, 3, \ldots$],
  [Type_name], [偏好的活動類別名稱], [VARCHAR(50)], [FK: TYPE(name)], [Not Null], [],
  table.hline(),
)
