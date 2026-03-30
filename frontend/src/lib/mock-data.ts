// Mock Data for MUSE CRM — 岩板建材銷售場景
// 當後端不可用時自動 fallback 使用這些資料

import type {
  Contact,
  ContactDetail,
  Conversation,
  Message,
  Analysis,
  Action,
  Note,
  Tag,
  DashboardStats,
  ChannelDistribution,
  ActivityPoint,
  PaginatedResponse,
} from './api';

// ── Helpers ────────────────────────────────────────────

function daysAgo(days: number, hours = 0, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, d.getMinutes() - minutes, 0, 0);
  return d.toISOString();
}

function hoursAgo(hours: number, minutes = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - hours, d.getMinutes() - minutes, 0, 0);
  return d.toISOString();
}

function minutesAgo(minutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutes, 0, 0);
  return d.toISOString();
}

// ── Tags ───────────────────────────────────────────────

export const mockTags: Tag[] = [
  { id: 1, name: '潛在客戶', tag_name: '潛在客戶', category: 'system', contact_count: 4, created_at: daysAgo(30) },
  { id: 2, name: 'VIP', tag_name: 'VIP', category: 'system', contact_count: 2, created_at: daysAgo(30) },
  { id: 3, name: '投訴者', tag_name: '投訴者', category: 'system', contact_count: 1, created_at: daysAgo(30) },
  { id: 4, name: '復購客戶', tag_name: '復購客戶', category: 'system', contact_count: 1, created_at: daysAgo(30) },
  { id: 5, name: '設計師', tag_name: '設計師', category: 'system', contact_count: 2, created_at: daysAgo(30) },
  { id: 6, name: '屋主', tag_name: '屋主', category: 'system', contact_count: 2, created_at: daysAgo(30) },
  { id: 7, name: '建材行', tag_name: '建材行', category: 'system', contact_count: 1, created_at: daysAgo(30) },
  { id: 8, name: '工班', tag_name: '工班', category: 'system', contact_count: 1, created_at: daysAgo(30) },
  { id: 9, name: '岩板', tag_name: '岩板', category: 'product', contact_count: 5, created_at: daysAgo(30) },
  { id: 10, name: '檯面', tag_name: '檯面', category: 'product', contact_count: 2, created_at: daysAgo(30) },
  { id: 11, name: '一體盆', tag_name: '一體盆', category: 'product', contact_count: 1, created_at: daysAgo(30) },
  { id: 12, name: '電視牆', tag_name: '電視牆', category: 'product', contact_count: 2, created_at: daysAgo(30) },
];

// ── Contacts ───────────────────────────────────────────

export const mockContacts: Contact[] = [
  {
    id: 1,
    platform_id: 'fb_wang_designer',
    name: '王設計師',
    display_name: '王雅婷 Interior Design',
    channel: 'messenger',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(14),
    last_seen: minutesAgo(35),
    conversation_count: 2,
    tags: [mockTags[0], mockTags[4], mockTags[8], mockTags[11]],
    priority: 'medium',
  },
  {
    id: 2,
    platform_id: 'ig_chen_mr',
    name: '陳先生',
    display_name: 'chen_home_2026',
    channel: 'instagram',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(5),
    last_seen: hoursAgo(2),
    conversation_count: 1,
    tags: [mockTags[0], mockTags[5], mockTags[9]],
    priority: 'low',
  },
  {
    id: 3,
    platform_id: 'line_lin_ms',
    name: '林小姐',
    display_name: '宏達建材行-林',
    channel: 'line',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(60),
    last_seen: hoursAgo(5),
    conversation_count: 3,
    tags: [mockTags[1], mockTags[6], mockTags[3], mockTags[8]],
    priority: 'high',
  },
  {
    id: 4,
    platform_id: 'fb_zhang_worker',
    name: '張工班',
    display_name: '張師傅',
    channel: 'messenger',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(30),
    last_seen: daysAgo(1),
    conversation_count: 2,
    tags: [mockTags[7], mockTags[8]],
    priority: 'low',
  },
  {
    id: 5,
    platform_id: 'ig_li_designer',
    name: '李設計師',
    display_name: 'LI Design Studio',
    channel: 'instagram',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(10),
    last_seen: hoursAgo(8),
    conversation_count: 1,
    tags: [mockTags[1], mockTags[4], mockTags[8]],
    priority: 'high',
  },
  {
    id: 6,
    platform_id: 'fb_huang_mrs',
    name: '黃太太',
    display_name: '黃淑芬',
    channel: 'messenger',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(90),
    last_seen: hoursAgo(1),
    conversation_count: 2,
    tags: [mockTags[2], mockTags[5], mockTags[3], mockTags[8]],
    priority: 'high',
  },
  {
    id: 7,
    platform_id: 'line_wu_mr',
    name: '吳先生',
    display_name: '吳建宏-承恩設計',
    channel: 'line',
    avatar_url: null,
    source_type: 'organic',
    first_seen: daysAgo(3),
    last_seen: daysAgo(0, 3),
    conversation_count: 1,
    tags: [mockTags[0], mockTags[4]],
    priority: 'low',
  },
  {
    id: 8,
    platform_id: 'ig_zhao_ms',
    name: '趙小姐',
    display_name: 'zhao_mimi_home',
    channel: 'instagram',
    avatar_url: null,
    source_type: 'ad_referral',
    first_seen: daysAgo(1),
    last_seen: minutesAgo(15),
    conversation_count: 1,
    tags: [mockTags[0], mockTags[10]],
    priority: 'low',
  },
];

// ── Messages (per conversation) ────────────────────────

const conv1Messages: Message[] = [
  {
    id: 101, conversation_id: 1, sender_type: 'customer', message_type: 'text',
    content: '你好，我想問一下你們的岩板電視牆有什麼款式？',
    media_url: null, timestamp: daysAgo(2, 4), is_read: true, platform_message_id: null,
  },
  {
    id: 102, conversation_id: 1, sender_type: 'business', message_type: 'text',
    content: '您好！我們有義大利進口 Laminam、西班牙 Dekton 和國產品牌，請問您的預算大概在什麼範圍？',
    media_url: null, timestamp: daysAgo(2, 3, 55), is_read: true, platform_message_id: null,
  },
  {
    id: 103, conversation_id: 1, sender_type: 'customer', message_type: 'text',
    content: '大概 3-5 萬吧，電視牆大小大概 3 米寬',
    media_url: null, timestamp: daysAgo(2, 3, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 104, conversation_id: 1, sender_type: 'business', message_type: 'text',
    content: '這個價位可以看看 Laminam 的仿大理石紋系列，3 米寬的話建議用 1600x3200 的大板，接縫少比較美觀',
    media_url: null, timestamp: daysAgo(2, 3, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 105, conversation_id: 1, sender_type: 'customer', message_type: 'text',
    content: '好的，可以去你們展間看實品嗎？',
    media_url: null, timestamp: daysAgo(2, 3, 20), is_read: true, platform_message_id: null,
  },
  {
    id: 106, conversation_id: 1, sender_type: 'business', message_type: 'text',
    content: '當然可以！我們展間在台北市內湖區，週一到週六 10:00-18:00 都可以，建議先預約，我可以幫您安排專人導覽',
    media_url: null, timestamp: daysAgo(2, 3, 10), is_read: true, platform_message_id: null,
  },
  {
    id: 107, conversation_id: 1, sender_type: 'customer', message_type: 'text',
    content: '那可以先幫我報個價嗎？我週五前要給業主看',
    media_url: null, timestamp: minutesAgo(35), is_read: true, platform_message_id: null,
  },
];

const conv2Messages: Message[] = [
  {
    id: 201, conversation_id: 2, sender_type: 'customer', message_type: 'text',
    content: '你好！我家新房在裝修，想做廚房石英石檯面，想了解一下價格',
    media_url: null, timestamp: daysAgo(3, 6), is_read: true, platform_message_id: null,
  },
  {
    id: 202, conversation_id: 2, sender_type: 'business', message_type: 'text',
    content: '您好！恭喜新居落成 🎉 請問廚房檯面大概多長呢？有沒有特別喜歡的花色？',
    media_url: null, timestamp: daysAgo(3, 5, 50), is_read: true, platform_message_id: null,
  },
  {
    id: 203, conversation_id: 2, sender_type: 'customer', message_type: 'text',
    content: 'L型的，大概 3.2 米加 1.8 米。我喜歡白色帶灰紋的那種，像卡拉拉白',
    media_url: null, timestamp: daysAgo(3, 5, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 204, conversation_id: 2, sender_type: 'business', message_type: 'text',
    content: '卡拉拉白紋路很經典！我們有 Caesarstone 和 Silestone 兩個品牌都有類似款。Caesarstone 5143 White Attica 和 Silestone Et. Calacatta Gold 都很受歡迎。L型含切割安裝大概 4.5-6.5 萬之間，看厚度選 2cm 還是 3cm',
    media_url: null, timestamp: daysAgo(3, 5, 10), is_read: true, platform_message_id: null,
  },
  {
    id: 205, conversation_id: 2, sender_type: 'customer', message_type: 'text',
    content: '價格OK，可以傳照片給我看看嗎？',
    media_url: null, timestamp: daysAgo(3, 4, 50), is_read: true, platform_message_id: null,
  },
  {
    id: 206, conversation_id: 2, sender_type: 'business', message_type: 'image',
    content: '這是 Caesarstone 5143 White Attica 的實拍照，您參考看看',
    media_url: '/mock/caesarstone-5143.jpg', timestamp: daysAgo(3, 4, 40), is_read: true, platform_message_id: null,
  },
  {
    id: 207, conversation_id: 2, sender_type: 'customer', message_type: 'text',
    content: '很好看欸！那含安裝嗎？我們裝修師傅說下個月中才會到這個階段',
    media_url: null, timestamp: hoursAgo(2), is_read: true, platform_message_id: null,
  },
];

const conv3Messages: Message[] = [
  {
    id: 301, conversation_id: 3, sender_type: 'customer', message_type: 'text',
    content: '你好，我是宏達建材的林小姐，想詢問 Dekton 岩板的批發價格',
    media_url: null, timestamp: daysAgo(1, 8), is_read: true, platform_message_id: null,
  },
  {
    id: 302, conversation_id: 3, sender_type: 'business', message_type: 'text',
    content: '林小姐您好！感謝詢問。請問您這次需要哪些規格和花色呢？量大概多少？',
    media_url: null, timestamp: daysAgo(1, 7, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 303, conversation_id: 3, sender_type: 'customer', message_type: 'text',
    content: '我們這邊設計師客戶蠻常指定 Dekton 的，想先備一些熱門色。Entzo、Aura、Kreta 這幾款，1200x2400 的，先各 5 片看看',
    media_url: null, timestamp: daysAgo(1, 7, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 304, conversation_id: 3, sender_type: 'business', message_type: 'text',
    content: '好的，這三款都是熱賣色。1200x2400x12mm 的話，批發價我幫您算一下，稍後回覆您正式報價。另外我們最近 Kelya 和 Natura 也賣很好，要不要也看看色卡？',
    media_url: null, timestamp: daysAgo(1, 7), is_read: true, platform_message_id: null,
  },
  {
    id: 305, conversation_id: 3, sender_type: 'customer', message_type: 'text',
    content: '好啊，色卡可以寄到我們店裡嗎？地址是新北市中和區中正路 XXX 號',
    media_url: null, timestamp: hoursAgo(5), is_read: true, platform_message_id: null,
  },
];

const conv4Messages: Message[] = [
  {
    id: 401, conversation_id: 4, sender_type: 'customer', message_type: 'text',
    content: '老闆你好，我是上次在你們那邊拿岩板的張師傅',
    media_url: null, timestamp: daysAgo(2, 10), is_read: true, platform_message_id: null,
  },
  {
    id: 402, conversation_id: 4, sender_type: 'business', message_type: 'text',
    content: '張師傅好！有什麼需要幫忙的嗎？',
    media_url: null, timestamp: daysAgo(2, 9, 50), is_read: true, platform_message_id: null,
  },
  {
    id: 403, conversation_id: 4, sender_type: 'customer', message_type: 'text',
    content: '想問一下那個 Laminam 3200x1600 的大板，浴室牆面要開蓮蓬頭的孔，你們有代切嗎？還是我們自己處理？',
    media_url: null, timestamp: daysAgo(2, 9, 40), is_read: true, platform_message_id: null,
  },
  {
    id: 404, conversation_id: 4, sender_type: 'business', message_type: 'text',
    content: '可以代切！我們有 CNC 水刀切割，圓孔方孔都能做。大板開孔建議交給我們比較安全，現場切容易裂。費用一個孔 $500-800 看大小',
    media_url: null, timestamp: daysAgo(2, 9, 20), is_read: true, platform_message_id: null,
  },
  {
    id: 405, conversation_id: 4, sender_type: 'customer', message_type: 'text',
    content: '好，那安裝用什麼膠？上次有片師傅用AB膠結果不太牢',
    media_url: null, timestamp: daysAgo(2, 9), is_read: true, platform_message_id: null,
  },
  {
    id: 406, conversation_id: 4, sender_type: 'business', message_type: 'text',
    content: '岩板上牆建議用專用岩板膠 + 背掛件，不能只用AB膠。我們有代理義大利 Mapei 的岩板專用膠，搭配不鏽鋼掛件最安全。需要的話我可以一起報價給您',
    media_url: null, timestamp: daysAgo(2, 8, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 407, conversation_id: 4, sender_type: 'customer', message_type: 'text',
    content: '好喔，那你報給我，膠 + 掛件 + 代切費用。我下禮拜要進場',
    media_url: null, timestamp: daysAgo(1), is_read: true, platform_message_id: null,
  },
];

const conv5Messages: Message[] = [
  {
    id: 501, conversation_id: 5, sender_type: 'customer', message_type: 'text',
    content: '您好，我是 LI Design Studio 的李設計師，我們手上有一個飯店案，需要大量石材',
    media_url: null, timestamp: daysAgo(4, 12), is_read: true, platform_message_id: null,
  },
  {
    id: 502, conversation_id: 5, sender_type: 'business', message_type: 'text',
    content: '李設計師您好！很榮幸收到詢問。可以先告訴我大概的需求嗎？坪數、用途和預算範圍？',
    media_url: null, timestamp: daysAgo(4, 11, 40), is_read: true, platform_message_id: null,
  },
  {
    id: 503, conversation_id: 5, sender_type: 'customer', message_type: 'text',
    content: '飯店大廳 + 走廊 + 電梯廳，大概 200 坪左右。地板想用大理石紋岩板，牆面部分區域也要做。風格偏義式奢華，預算還在抓，先看你們能提供什麼方案',
    media_url: null, timestamp: daysAgo(4, 11), is_read: true, platform_message_id: null,
  },
  {
    id: 504, conversation_id: 5, sender_type: 'business', message_type: 'text',
    content: '200 坪的飯店案非常適合用大尺寸岩板！建議方案：\n\n🔹 地板：Laminam Calacatta Gold 1620x3240 亮面\n🔹 牆面重點區：Dekton Entzo 仿大理石\n🔹 電梯廳：Laminam Noir Desir 黑金紋\n\n這些都是飯店常用的高端款。需要的話我可以準備實際案例照片和樣品給您看',
    media_url: null, timestamp: daysAgo(4, 10, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 505, conversation_id: 5, sender_type: 'customer', message_type: 'text',
    content: '聽起來不錯。你們有做過飯店案的實績嗎？可以傳幾張照片給我參考',
    media_url: null, timestamp: daysAgo(3, 8), is_read: true, platform_message_id: null,
  },
  {
    id: 506, conversation_id: 5, sender_type: 'business', message_type: 'text',
    content: '有的！我們做過台中某五星飯店和宜蘭度假村的案子，我整理一下案例資料傳給您。另外 200 坪以上我們有商業案專案報價，比零售優惠很多',
    media_url: null, timestamp: daysAgo(3, 7, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 507, conversation_id: 5, sender_type: 'customer', message_type: 'text',
    content: '好的，我下週跟業主開會，到時候可能需要你們一起來提案',
    media_url: null, timestamp: hoursAgo(8), is_read: true, platform_message_id: null,
  },
];

const conv6Messages: Message[] = [
  {
    id: 601, conversation_id: 6, sender_type: 'customer', message_type: 'text',
    content: '你好，我是之前跟你們買岩板做電視牆的黃太太',
    media_url: null, timestamp: daysAgo(0, 4), is_read: true, platform_message_id: null,
  },
  {
    id: 602, conversation_id: 6, sender_type: 'business', message_type: 'text',
    content: '黃太太您好！有什麼我可以幫忙的嗎？',
    media_url: null, timestamp: daysAgo(0, 3, 50), is_read: true, platform_message_id: null,
  },
  {
    id: 603, conversation_id: 6, sender_type: 'customer', message_type: 'text',
    content: '我發現電視牆的岩板有一條裂縫！安裝才兩個月欸，這是品質問題吧？',
    media_url: null, timestamp: daysAgo(0, 3, 40), is_read: true, platform_message_id: null,
  },
  {
    id: 604, conversation_id: 6, sender_type: 'customer', message_type: 'image',
    content: '你看這個裂縫',
    media_url: '/mock/crack-photo.jpg', timestamp: daysAgo(0, 3, 38), is_read: true, platform_message_id: null,
  },
  {
    id: 605, conversation_id: 6, sender_type: 'business', message_type: 'text',
    content: '非常抱歉造成您的困擾 🙏 從照片看起來可能是安裝時底材膨脹導致的應力裂，我們會負責處理。我安排師傅本週到府勘查，您方便的時間是？',
    media_url: null, timestamp: daysAgo(0, 3, 20), is_read: true, platform_message_id: null,
  },
  {
    id: 606, conversation_id: 6, sender_type: 'customer', message_type: 'text',
    content: '週四或週五下午都可以。要怎麼處理？要整片換嗎？',
    media_url: null, timestamp: daysAgo(0, 2, 50), is_read: true, platform_message_id: null,
  },
  {
    id: 607, conversation_id: 6, sender_type: 'business', message_type: 'text',
    content: '先讓師傅看看裂縫的狀況。如果是表面裂可以用岩板修復膠處理，如果較嚴重我們免費換片。您放心，保固期內我們全程負責',
    media_url: null, timestamp: hoursAgo(1), is_read: true, platform_message_id: null,
  },
];

const conv7Messages: Message[] = [
  {
    id: 701, conversation_id: 7, sender_type: 'customer', message_type: 'text',
    content: '你好，我是承恩設計的吳建宏，最近有幾個案子需要用到岩板，想去你們展間看看有什麼新品',
    media_url: null, timestamp: daysAgo(1, 6), is_read: true, platform_message_id: null,
  },
  {
    id: 702, conversation_id: 7, sender_type: 'business', message_type: 'text',
    content: '吳先生您好！歡迎隨時來參觀。我們最近進了幾款新的 Laminam 義大利岩板，有仿水泥、仿金屬和超白系列，非常適合現代風設計',
    media_url: null, timestamp: daysAgo(1, 5, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 703, conversation_id: 7, sender_type: 'customer', message_type: 'text',
    content: '聽起來不錯！我這兩天比較忙，下禮拜二或三可以嗎？最好能看到實際安裝的效果',
    media_url: null, timestamp: daysAgo(1, 5, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 704, conversation_id: 7, sender_type: 'business', message_type: 'text',
    content: '沒問題！週二三都OK，我們展間有做好的電視牆和檯面實景，您可以直接摸到材質感受。我幫您預約哪一天呢？',
    media_url: null, timestamp: daysAgo(0, 3), is_read: true, platform_message_id: null,
  },
  {
    id: 705, conversation_id: 7, sender_type: 'customer', message_type: 'text',
    content: '就週三下午兩點吧，到時候見！',
    media_url: null, timestamp: daysAgo(0, 3), is_read: false, platform_message_id: null,
  },
];

const conv8Messages: Message[] = [
  {
    id: 801, conversation_id: 8, sender_type: 'system', message_type: 'text',
    content: '此客戶從 Instagram 廣告進入',
    media_url: null, timestamp: daysAgo(1, 2), is_read: true, platform_message_id: null,
  },
  {
    id: 802, conversation_id: 8, sender_type: 'customer', message_type: 'text',
    content: '你好～看到你們IG廣告的一體盆好好看！請問多少錢？',
    media_url: null, timestamp: daysAgo(1, 2), is_read: true, platform_message_id: null,
  },
  {
    id: 803, conversation_id: 8, sender_type: 'business', message_type: 'text',
    content: '謝謝您的關注 ❤️ 我們的岩板一體盆有幾種尺寸：\n\n60cm - $12,800\n80cm - $16,800\n100cm - $21,800\n120cm - $26,800\n\n含岩板檯面和一體成型盆體，不含龍頭和安裝。顏色有白、灰、大理石紋可選',
    media_url: null, timestamp: daysAgo(1, 1, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 804, conversation_id: 8, sender_type: 'customer', message_type: 'text',
    content: '80cm 的蠻適合我家浴室的！大理石紋有照片嗎？',
    media_url: null, timestamp: daysAgo(1, 1, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 805, conversation_id: 8, sender_type: 'business', message_type: 'image',
    content: '這是 80cm 大理石紋一體盆的實拍，很多客人選這款 ✨',
    media_url: '/mock/basin-marble.jpg', timestamp: daysAgo(1, 1, 15), is_read: true, platform_message_id: null,
  },
  {
    id: 806, conversation_id: 8, sender_type: 'customer', message_type: 'text',
    content: '好看！含安裝的話要多少？我在台北',
    media_url: null, timestamp: minutesAgo(15), is_read: true, platform_message_id: null,
  },
];

// Extra conversations for variety
const conv9Messages: Message[] = [
  {
    id: 901, conversation_id: 9, sender_type: 'customer', message_type: 'text',
    content: '請問你們有沒有做中島檯面？',
    media_url: null, timestamp: daysAgo(6, 3), is_read: true, platform_message_id: null,
  },
  {
    id: 902, conversation_id: 9, sender_type: 'business', message_type: 'text',
    content: '有的！中島是我們的強項之一。請問您中島的尺寸大概多大呢？',
    media_url: null, timestamp: daysAgo(6, 2, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 903, conversation_id: 9, sender_type: 'customer', message_type: 'text',
    content: '大概 180x90 cm，想要瀑布邊設計',
    media_url: null, timestamp: daysAgo(6, 2, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 904, conversation_id: 9, sender_type: 'business', message_type: 'text',
    content: '瀑布邊很漂亮！180x90 含兩側瀑布的話，石英石約 5-7 萬，岩板會再高一些。我幫您出個正式報價？',
    media_url: null, timestamp: daysAgo(6, 2), is_read: true, platform_message_id: null,
  },
  {
    id: 905, conversation_id: 9, sender_type: 'customer', message_type: 'text',
    content: '好的麻煩你了，我是王設計師之前有跟你聯繫過',
    media_url: null, timestamp: daysAgo(6, 1, 40), is_read: true, platform_message_id: null,
  },
];

const conv10Messages: Message[] = [
  {
    id: 1001, conversation_id: 10, sender_type: 'customer', message_type: 'text',
    content: '我上次跟你們買的 Dekton Entzo 還要再追加 3 片，同規格 1200x2400',
    media_url: null, timestamp: daysAgo(5, 4), is_read: true, platform_message_id: null,
  },
  {
    id: 1002, conversation_id: 10, sender_type: 'business', message_type: 'text',
    content: '好的林小姐，Dekton Entzo 1200x2400x12mm 追加 3 片，我確認一下庫存',
    media_url: null, timestamp: daysAgo(5, 3, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 1003, conversation_id: 10, sender_type: 'business', message_type: 'text',
    content: '庫存充足！3 片批發價跟上次一樣，要直接出貨嗎？',
    media_url: null, timestamp: daysAgo(5, 3), is_read: true, platform_message_id: null,
  },
  {
    id: 1004, conversation_id: 10, sender_type: 'customer', message_type: 'text',
    content: '直接出吧，一樣送到中和店裡，謝謝',
    media_url: null, timestamp: daysAgo(5, 2, 30), is_read: true, platform_message_id: null,
  },
];

const conv11Messages: Message[] = [
  {
    id: 1101, conversation_id: 11, sender_type: 'customer', message_type: 'text',
    content: '老闆，上次那個案子的岩板 45 度導角可以做嗎？',
    media_url: null, timestamp: daysAgo(7, 5), is_read: true, platform_message_id: null,
  },
  {
    id: 1102, conversation_id: 11, sender_type: 'business', message_type: 'text',
    content: '可以的張師傅。45度密縫對接是我們的常規加工項目。12mm 的板做 45 度導角一米 $300',
    media_url: null, timestamp: daysAgo(7, 4, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 1103, conversation_id: 11, sender_type: 'customer', message_type: 'text',
    content: 'OK 那幫我處理，大概 6 米長的量',
    media_url: null, timestamp: daysAgo(7, 4, 30), is_read: true, platform_message_id: null,
  },
];

const conv12Messages: Message[] = [
  {
    id: 1201, conversation_id: 12, sender_type: 'customer', message_type: 'text',
    content: '你好，我上次裝的電視牆想追加一面餐廳牆，同款式',
    media_url: null, timestamp: daysAgo(4, 6), is_read: true, platform_message_id: null,
  },
  {
    id: 1202, conversation_id: 12, sender_type: 'business', message_type: 'text',
    content: '黃太太您好！您上次是用 Laminam 仿大理石紋對吧？餐廳牆大概多大面積呢？',
    media_url: null, timestamp: daysAgo(4, 5, 45), is_read: true, platform_message_id: null,
  },
  {
    id: 1203, conversation_id: 12, sender_type: 'customer', message_type: 'text',
    content: '對，就是那款。餐廳牆大概 2.5 米寬 2.4 米高',
    media_url: null, timestamp: daysAgo(4, 5, 30), is_read: true, platform_message_id: null,
  },
  {
    id: 1204, conversation_id: 12, sender_type: 'business', message_type: 'text',
    content: '復購客戶我們有優惠！這面積用一片 1600x3200 的大板加切割就夠了。含安裝估計 2.8-3.2 萬，我幫您出個詳細報價',
    media_url: null, timestamp: daysAgo(4, 5), is_read: true, platform_message_id: null,
  },
];

// ── Conversations ──────────────────────────────────────

export const mockConversations: Conversation[] = [
  {
    id: 1, contact_id: 1, channel: 'messenger', status: 'active', urgency: 'high' as const,
    started_at: daysAgo(2, 4), ended_at: null, message_count: 7,
    platform_conversation_id: null,
    contact: mockContacts[0],
    last_message: conv1Messages[conv1Messages.length - 1],
    messages: conv1Messages,
    analyses: [],
  },
  {
    id: 2, contact_id: 2, channel: 'instagram', status: 'active', urgency: 'medium' as const,
    started_at: daysAgo(3, 6), ended_at: null, message_count: 7,
    platform_conversation_id: null,
    contact: mockContacts[1],
    last_message: conv2Messages[conv2Messages.length - 1],
    messages: conv2Messages,
    analyses: [],
  },
  {
    id: 3, contact_id: 3, channel: 'line', status: 'unanswered', urgency: 'low' as const,
    started_at: daysAgo(1, 8), ended_at: null, message_count: 5,
    platform_conversation_id: null,
    contact: mockContacts[2],
    last_message: conv3Messages[conv3Messages.length - 1],
    messages: conv3Messages,
    analyses: [],
  },
  {
    id: 4, contact_id: 4, channel: 'messenger', status: 'silent', urgency: 'low' as const,
    started_at: daysAgo(2, 10), ended_at: null, message_count: 7,
    platform_conversation_id: null,
    contact: mockContacts[3],
    last_message: conv4Messages[conv4Messages.length - 1],
    messages: conv4Messages,
    analyses: [],
  },
  {
    id: 5, contact_id: 5, channel: 'instagram', status: 'silent', urgency: 'high' as const,
    started_at: daysAgo(4, 12), ended_at: null, message_count: 7,
    platform_conversation_id: null,
    contact: mockContacts[4],
    last_message: conv5Messages[conv5Messages.length - 1],
    messages: conv5Messages,
    analyses: [],
  },
  {
    id: 6, contact_id: 6, channel: 'messenger', status: 'active', urgency: 'high' as const,
    started_at: daysAgo(0, 4), ended_at: null, message_count: 7,
    platform_conversation_id: null,
    contact: mockContacts[5],
    last_message: conv6Messages[conv6Messages.length - 1],
    messages: conv6Messages,
    analyses: [],
  },
  {
    id: 7, contact_id: 7, channel: 'line', status: 'unanswered', urgency: 'low' as const,
    started_at: daysAgo(1, 6), ended_at: null, message_count: 5,
    platform_conversation_id: null,
    contact: mockContacts[6],
    last_message: conv7Messages[conv7Messages.length - 1],
    messages: conv7Messages,
    analyses: [],
  },
  {
    id: 8, contact_id: 8, channel: 'instagram', status: 'active', urgency: 'medium' as const,
    started_at: daysAgo(1, 2), ended_at: null, message_count: 6,
    platform_conversation_id: null,
    contact: mockContacts[7],
    last_message: conv8Messages[conv8Messages.length - 1],
    messages: conv8Messages,
    analyses: [],
  },
  // Closed conversations with analyses
  {
    id: 9, contact_id: 1, channel: 'messenger', status: 'closed', urgency: 'low' as const,
    started_at: daysAgo(10), ended_at: daysAgo(6), message_count: 5,
    platform_conversation_id: null,
    contact: mockContacts[0],
    last_message: conv9Messages[conv9Messages.length - 1],
    messages: conv9Messages,
    analyses: [
      {
        id: 1, conversation_id: 9, analysis_type: 'full_analysis',
        model_used: 'gpt-4o',
        created_at: daysAgo(6),
        result: {
          customer_name: '王設計師',
          demand_summary: '詢問中島檯面報價，180x90cm 瀑布邊設計，預算 5-7 萬',
          mentioned_products: ['石英石檯面', '岩板檯面', '瀑布邊中島'],
          suggested_tags: ['設計師', '檯面', '潛在客戶'],
          conversation_summary: '王設計師詢問中島檯面瀑布邊設計，了解石英石和岩板的價差，已提供初步報價',
          suggested_action: '出具正式報價單，附上瀑布邊中島的實拍照',
          sentiment: 'positive',
          intent: 'pricing',
          urgency: 'medium',
        },
      },
    ],
  },
  {
    id: 10, contact_id: 3, channel: 'line', status: 'closed', urgency: 'low' as const,
    started_at: daysAgo(8), ended_at: daysAgo(5), message_count: 4,
    platform_conversation_id: null,
    contact: mockContacts[2],
    last_message: conv10Messages[conv10Messages.length - 1],
    messages: conv10Messages,
    analyses: [
      {
        id: 2, conversation_id: 10, analysis_type: 'full_analysis',
        model_used: 'gpt-4o',
        created_at: daysAgo(5),
        result: {
          customer_name: '林小姐（宏達建材行）',
          demand_summary: '追加訂購 Dekton Entzo 1200x2400 三片，直接出貨到中和店',
          mentioned_products: ['Dekton Entzo'],
          suggested_tags: ['建材行', 'VIP', '復購客戶'],
          conversation_summary: '老客戶追加訂購，確認庫存後直接出貨。批發價維持原議。',
          suggested_action: '確認出貨並追蹤物流',
          sentiment: 'positive',
          intent: 'order',
          urgency: 'medium',
        },
      },
    ],
  },
  {
    id: 11, contact_id: 4, channel: 'messenger', status: 'closed', urgency: 'low' as const,
    started_at: daysAgo(10), ended_at: daysAgo(7), message_count: 3,
    platform_conversation_id: null,
    contact: mockContacts[3],
    last_message: conv11Messages[conv11Messages.length - 1],
    messages: conv11Messages,
    analyses: [
      {
        id: 3, conversation_id: 11, analysis_type: 'full_analysis',
        model_used: 'gpt-4o',
        created_at: daysAgo(7),
        result: {
          customer_name: '張工班',
          demand_summary: '岩板 45 度導角加工，6 米長度',
          mentioned_products: ['岩板加工（45度導角）'],
          suggested_tags: ['工班', '加工'],
          conversation_summary: '張師傅詢問岩板 45 度導角加工服務和費用，已確認訂單。',
          suggested_action: '安排加工排程',
          sentiment: 'neutral',
          intent: 'spec',
          urgency: 'low',
        },
      },
    ],
  },
  {
    id: 12, contact_id: 6, channel: 'messenger', status: 'closed', urgency: 'low' as const,
    started_at: daysAgo(4, 6), ended_at: daysAgo(4), message_count: 4,
    platform_conversation_id: null,
    contact: mockContacts[5],
    last_message: conv12Messages[conv12Messages.length - 1],
    messages: conv12Messages,
    analyses: [
      {
        id: 4, conversation_id: 12, analysis_type: 'full_analysis',
        model_used: 'gpt-4o',
        created_at: daysAgo(4),
        result: {
          customer_name: '黃太太',
          demand_summary: '追加餐廳牆面岩板，同款 Laminam 仿大理石紋，2.5x2.4m',
          mentioned_products: ['Laminam 仿大理石紋岩板'],
          suggested_tags: ['復購客戶', '屋主', '電視牆'],
          conversation_summary: '黃太太對之前電視牆效果滿意，追加餐廳牆面。復購客戶享優惠價。',
          suggested_action: '出具含安裝的復購優惠報價單',
          sentiment: 'positive',
          intent: 'order',
          urgency: 'low',
        },
      },
    ],
  },
];

// ── Contact Entity Info (quick extraction: phone, address, email, company) ──

export interface ContactEntityInfo {
  phone?: string;
  address?: string;
  email?: string;
  company?: string;
}

export const mockContactEntities: Record<string | number, ContactEntityInfo> = {
  1: { phone: '0912-345-678', address: '台北市內湖區' },
  2: { phone: '0923-456-789', address: '台北市信義區' },
  3: { phone: '02-2222-3333', address: '新北市中和區中正路XXX號', company: '宏達建材行' },
  4: { phone: '0934-567-890' },
  5: { phone: '02-2771-8888', company: 'LI Design Studio' },
  6: { phone: '0945-678-901', address: '台北市松山區' },
  7: { phone: '0956-789-012', company: '承恩設計' },
  8: { email: 'zhao_mimi@gmail.com' },
};

// ── Quick Triage Data (attached to messages) ───────────

export const mockQuickTriage: Record<string | number, { quick_intent: string; quick_identity: string }> = {
  101: { quick_intent: '詢價', quick_identity: '設計師' },
  103: { quick_intent: '規格', quick_identity: '設計師' },
  105: { quick_intent: '參觀', quick_identity: '設計師' },
  107: { quick_intent: '詢價', quick_identity: '設計師' },
  201: { quick_intent: '詢價', quick_identity: '屋主' },
  205: { quick_intent: '規格', quick_identity: '屋主' },
  207: { quick_intent: '跟進', quick_identity: '屋主' },
  301: { quick_intent: '詢價', quick_identity: '建材行' },
  303: { quick_intent: '下單', quick_identity: '建材行' },
  305: { quick_intent: '跟進', quick_identity: '建材行' },
  401: { quick_intent: '招呼', quick_identity: '工班' },
  403: { quick_intent: '規格', quick_identity: '工班' },
  405: { quick_intent: '規格', quick_identity: '工班' },
  407: { quick_intent: '詢價', quick_identity: '工班' },
  501: { quick_intent: '招呼', quick_identity: '設計師' },
  503: { quick_intent: '規格', quick_identity: '設計師' },
  505: { quick_intent: '跟進', quick_identity: '設計師' },
  507: { quick_intent: '跟進', quick_identity: '設計師' },
  603: { quick_intent: '投訴', quick_identity: '屋主' },
  606: { quick_intent: '跟進', quick_identity: '屋主' },
  701: { quick_intent: '參觀', quick_identity: '設計師' },
  703: { quick_intent: '參觀', quick_identity: '設計師' },
  802: { quick_intent: '詢價', quick_identity: 'unknown' },
  804: { quick_intent: '規格', quick_identity: 'unknown' },
  806: { quick_intent: '詢價', quick_identity: 'unknown' },
};

// ── Actions ────────────────────────────────────────────

export const mockActions: Action[] = [
  {
    id: 1, contact_id: 1, conversation_id: 1,
    source: 'manual', action_type: 'quote', description: '週五前提供正式報價單（電視牆 Laminam 大板）',
    priority: 'medium', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString(); })(),
    completed_at: null, created_at: daysAgo(1),
    contact: mockContacts[0],
  },
  {
    id: 2, contact_id: 7, conversation_id: 7,
    source: 'manual', action_type: 'visit', description: '安排展間參觀 — 週三下午兩點',
    priority: 'medium', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 4); return d.toISOString(); })(),
    completed_at: null, created_at: daysAgo(0, 3),
    contact: mockContacts[6],
  },
  {
    id: 3, contact_id: 6, conversation_id: 6,
    source: 'manual', action_type: 'after_sales', description: '派師傅到場處理裂縫 — 黃太太電視牆保固維修',
    priority: 'high', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString(); })(),
    completed_at: null, created_at: hoursAgo(1),
    contact: mockContacts[5],
  },
  {
    id: 4, contact_id: 3, conversation_id: 3,
    source: 'manual', action_type: 'delivery', description: '寄送 Dekton 色卡（Kelya、Natura）到宏達建材行',
    priority: 'low', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString(); })(),
    completed_at: null, created_at: hoursAgo(5),
    contact: mockContacts[2],
  },
  {
    id: 5, contact_id: 5, conversation_id: 5,
    source: 'llm', action_type: 'proposal', description: '準備飯店案實績資料和商業報價方案',
    priority: 'high', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString(); })(),
    completed_at: null, created_at: hoursAgo(8),
    contact: mockContacts[4],
  },
  {
    id: 6, contact_id: 4, conversation_id: 4,
    source: 'manual', action_type: 'quote', description: '提供切割+膠+掛件的組合報價',
    priority: 'medium', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString(); })(),
    completed_at: null, created_at: daysAgo(1),
    contact: mockContacts[3],
  },
  {
    id: 9, contact_id: 2, conversation_id: 2,
    source: 'manual', action_type: 'measure', description: '安排丈量 — 陳先生新房',
    priority: 'medium', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString(); })(),
    completed_at: null, created_at: hoursAgo(2),
    contact: mockContacts[1],
  },
  {
    id: 10, contact_id: 4, conversation_id: 4,
    source: 'manual', action_type: 'construction', description: '張工班施工進場',
    priority: 'high', status: 'pending',
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString(); })(),
    completed_at: null, created_at: hoursAgo(1),
    contact: mockContacts[3],
  },
  // Some completed actions
  {
    id: 7, contact_id: 3, conversation_id: 10,
    source: 'manual', action_type: 'delivery', description: '追加 3 片 Dekton Entzo 出貨至中和店',
    priority: 'medium', status: 'completed',
    due_date: daysAgo(4), completed_at: daysAgo(4, 6),
    created_at: daysAgo(5),
    contact: mockContacts[2],
  },
  {
    id: 8, contact_id: 4, conversation_id: 11,
    source: 'manual', action_type: 'processing', description: '45度導角加工 6米',
    priority: 'low', status: 'completed',
    due_date: daysAgo(6), completed_at: daysAgo(6, 4),
    created_at: daysAgo(7),
    contact: mockContacts[3],
  },
];

// ── Notes ──────────────────────────────────────────────

export const mockNotes: Record<string | number, Note[]> = {
  1: [
    { id: 1, contact_id: 1, content: '王設計師很專業，熟悉各品牌岩板，決策速度快。預算 3-5 萬可推 Laminam。', author_id: 'admin', created_by: 'admin', created_at: daysAgo(2) },
    { id: 2, contact_id: 1, content: '已加 LINE，後續大案可直接聯繫。', author_id: 'admin', created_by: 'admin', created_at: daysAgo(6) },
  ],
  3: [
    { id: 3, contact_id: 3, content: 'VIP 批發客戶，每月平均進貨 10-15 片。維持好關係。', author_id: 'admin', created_by: 'admin', created_at: daysAgo(30) },
  ],
  5: [
    { id: 4, contact_id: 5, content: '飯店案預算估計 200-300 萬以上，重點客戶。需準備完整提案資料。', author_id: 'admin', created_by: 'admin', created_at: daysAgo(3) },
  ],
  6: [
    { id: 5, contact_id: 6, content: '保固客戶，上次電視牆安裝 2 個月出現裂縫。需優先處理以維護口碑。', author_id: 'admin', created_by: 'admin', created_at: hoursAgo(1) },
    { id: 6, contact_id: 6, content: '之前消費紀錄：電視牆 + 餐廳牆，總消費約 6 萬。', author_id: 'admin', created_by: 'admin', created_at: daysAgo(4) },
  ],
};

// ── Dashboard Stats ────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  total_contacts: 8,
  total_conversations: 12,
  active_conversations: 8,
  total_messages: 68,
  pending_actions: 8,
};

// ── Extended Dashboard Stats ───────────────────────────

export const mockUrgencyDistribution = { high: 3, medium: 2, low: 7 };
export const mockStatusDistribution = { active: 4, silent: 2, unanswered: 2 };
export const mockTodayMessages = { count: 12, yesterdayCount: 9 };
export const mockSourceAnalysis = { organic: 5, ad: 2, referral: 1 };

export const mockChannelDistribution: ChannelDistribution[] = [
  { channel: 'messenger', count: 5 },
  { channel: 'instagram', count: 4 },
  { channel: 'line', count: 3 },
];

export const mockActivity: ActivityPoint[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    date: d.toISOString().split('T')[0],
    messages: Math.floor(Math.random() * 20) + (i > 22 ? 8 : 2),
    conversations: Math.floor(Math.random() * 5) + (i > 22 ? 2 : 0),
  };
});

// ── Quick Replies (預存語錄) ──────────────────────────────

export interface QuickReply {
  id: number;
  category: string;
  title: string;
  content: string;
}

export const mockQuickReplies: QuickReply[] = [
  // 問候語
  { id: 1, category: '問候語', title: '標準問候', content: '您好！感謝您的詢問，我是繆思精工的客服，很高興為您服務。' },
  { id: 2, category: '問候語', title: '簡短問候', content: '您好！請問有什麼可以幫您的嗎？' },
  // 產品介紹
  { id: 3, category: '產品介紹', title: '品牌總覽', content: '我們有義大利進口 Laminam、西班牙 Dekton 和國產品牌可供選擇，請問您的預算大概在什麼範圍？' },
  { id: 4, category: '產品介紹', title: '電視牆建議', content: '岩板電視牆建議使用 1600x3200mm 大板，接縫少比較美觀。' },
  // 報價相關
  { id: 5, category: '報價相關', title: '報價通知', content: '收到您的需求，我會盡快為您準備正式報價單，預計在 X 個工作天內提供。' },
  { id: 6, category: '報價相關', title: '報價已發送', content: '報價已發送至您的信箱，如有任何疑問歡迎隨時聯繫。' },
  // 售後回覆
  { id: 7, category: '售後回覆', title: '問題處理', content: '非常抱歉造成您的困擾，我們會盡快安排師傅到場處理。' },
  { id: 8, category: '售後回覆', title: '感謝反饋', content: '感謝您的反饋，我們會立即為您處理，請問您方便的時間是？' },
];

// ── AI Suggested Replies ───────────────────────────────

export const mockAiSuggestedReplies: Record<string | number, string> = {
  // conversationId → suggested reply text
  // 王設計師 conv 1 (active, has related closed conv 9 with analysis)
  1: '王設計師您好，電視牆 Laminam 大板的正式報價單已為您準備好，請查收附件。如有需要可安排展間參觀。',
  // 黃太太 conv 6 (active, has related closed conv 12 with analysis)
  6: '黃太太您好，非常抱歉造成困擾。已為您安排師傅本週四下午到場勘查，届時會先評估裂縫狀況再決定處理方式。',
};

// Helper: check if a conversation has been analyzed (directly or via contact's other convs)
export function getConversationAnalysis(conversationId: string | number): { hasAnalysis: boolean; suggestedReply: string | null } {
  const conv = mockConversations.find((c) => c.id === conversationId);
  if (!conv) return { hasAnalysis: false, suggestedReply: null };

  // Check direct analysis on this conversation
  if (conv.analyses && conv.analyses.length > 0) {
    return {
      hasAnalysis: true,
      suggestedReply: mockAiSuggestedReplies[conversationId] || null,
    };
  }

  // Check if contact has other conversations with analyses
  const contactConvs = mockConversations.filter((c) => c.contact_id === conv.contact_id);
  const hasAnyAnalysis = contactConvs.some((c) => c.analyses && c.analyses.length > 0);

  if (hasAnyAnalysis && mockAiSuggestedReplies[conversationId]) {
    return {
      hasAnalysis: true,
      suggestedReply: mockAiSuggestedReplies[conversationId],
    };
  }

  return { hasAnalysis: hasAnyAnalysis, suggestedReply: null };
}

// ── Mock API Functions ─────────────────────────────────

export function getMockConversations(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  channel?: string;
  search?: string;
  urgency?: string;
}): PaginatedResponse<Conversation> {
  let filtered = [...mockConversations];

  if (params?.status) {
    filtered = filtered.filter((c) => c.status === params.status);
  }
  if (params?.channel) {
    filtered = filtered.filter((c) => c.channel === params.channel);
  }
  if (params?.urgency) {
    filtered = filtered.filter((c) => c.urgency === params.urgency);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.contact?.name.toLowerCase().includes(q) ||
        c.last_message?.content.toLowerCase().includes(q)
    );
  }

  // Sort by last message time (most recent first)
  filtered.sort((a, b) => {
    const aTime = a.last_message?.timestamp || a.started_at || '';
    const bTime = b.last_message?.timestamp || b.started_at || '';
    return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
  });

  const page = params?.page || 1;
  const perPage = params?.per_page || 20;
  const start = (page - 1) * perPage;
  const data = filtered.slice(start, start + perPage);

  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total: filtered.length,
      pages: Math.ceil(filtered.length / perPage),
    },
  };
}

export function getMockConversation(id: string | number): Conversation | null {
  const conv = mockConversations.find((c) => c.id === id);
  if (!conv) return null;

  // Attach quick triage intent badges to messages
  const messagesWithTriage = conv.messages?.map((msg) => {
    const triage = mockQuickTriage[msg.id];
    if (triage) {
      return { ...msg, quick_intent: triage.quick_intent };
    }
    return msg;
  });

  return { ...conv, messages: messagesWithTriage };
}

export function getMockContacts(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  tag?: string;
  channel?: string;
  source_type?: string;
}): PaginatedResponse<Contact> {
  let filtered = [...mockContacts];

  if (params?.channel) {
    filtered = filtered.filter((c) => c.channel === params.channel);
  }
  if (params?.source_type) {
    filtered = filtered.filter((c) => c.source_type === params.source_type);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.display_name && c.display_name.toLowerCase().includes(q))
    );
  }
  if (params?.tag) {
    filtered = filtered.filter((c) => c.tags?.some((t) => t.tag_name === params.tag));
  }

  const page = params?.page || 1;
  const perPage = params?.per_page || 20;
  const start = (page - 1) * perPage;
  const data = filtered.slice(start, start + perPage);

  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total: filtered.length,
      pages: Math.ceil(filtered.length / perPage),
    },
  };
}

export function getMockContactDetail(id: string | number): ContactDetail | null {
  const contact = mockContacts.find((c) => c.id === id);
  if (!contact) return null;

  const conversations = mockConversations.filter((c) => c.contact_id === id);
  const analyses = conversations.flatMap((c) => c.analyses || []);
  const actions = mockActions.filter((a) => a.contact_id === id);
  const notes = mockNotes[id] || [];

  return {
    ...contact,
    tags: contact.tags || [],
    conversations: conversations.map(({ messages, analyses, ...rest }) => rest),
    analyses,
    actions,
    notes,
  };
}

export function getMockActions(params?: {
  status?: string;
  priority?: string;
  sort?: string;
  contact_id?: string | number;
}): Action[] {
  let filtered = [...mockActions];

  if (params?.status) {
    filtered = filtered.filter((a) => a.status === params.status);
  }
  if (params?.priority) {
    filtered = filtered.filter((a) => a.priority === params.priority);
  }
  if (params?.contact_id) {
    filtered = filtered.filter((a) => a.contact_id === params.contact_id);
  }

  return filtered;
}
