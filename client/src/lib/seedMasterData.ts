// Auto-generated from current production Firestore master data.
export type SeedShopConfig = typeof seedShopConfig

export const seedShopConfig = {
  "time_slot_interval": 30,
  "business_hours": {
    "end": "19:00",
    "start": "10:00"
  },
  "holiday_weekdays": [
    2
  ],
  "closed_dates": [
    "2026-02-13"
  ],
  "tax_rate": 10,
  "max_future_booking_months": 2,
  "tenantId": "thuARQEfVeAC0Nbrwlw7"
} as const

export const seedStaffs = [
  {
    "id": "father",
    "code": "ft",
    "name": "オーナー",
    "display_name": "オーナー",
    "roles": {
      "accepts_free_booking": true,
      "accepts_new_customer": false
    },
    "is_working": false,
    "order_priority": 1,
    "color": "#beb22d",
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "brother",
    "code": "bt",
    "name": "最能宏幸　店長",
    "display_name": "ひろゆき（スタッフ）",
    "roles": {
      "accepts_new_customer": true,
      "accepts_free_booking": true
    },
    "is_working": true,
    "order_priority": 2,
    "color": "#3498db",
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "mother",
    "code": "mt",
    "name": "由美子先生",
    "display_name": "ユミコ（美容専門）",
    "roles": {
      "accepts_free_booking": false,
      "accepts_new_customer": true
    },
    "is_working": false,
    "order_priority": 3,
    "color": "#db33a6",
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "OZJmONhYOuHDBZwKcTlD",
    "code": "sr",
    "name": "香　院長",
    "display_name": "カオリ(カイロプラクティック)",
    "roles": {
      "accepts_free_booking": true,
      "accepts_new_customer": true
    },
    "is_working": true,
    "order_priority": 99,
    "color": "#ffa55c"
  }
] as const

export const seedMenus = [
  {
    "id": "menu_10",
    "title": "総合調髪",
    "price": 3637,
    "price_with_tax": 4000,
    "duration_min": 60,
    "category": "barber",
    "description": "カット+シャンプー＋顔そり（眉カット込み）",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 1,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_160",
    "title": "カット&シャンプー",
    "price": 3500,
    "price_with_tax": 3850,
    "duration_min": 60,
    "category": "beauty",
    "description": "",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 1,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_40",
    "title": "学生カット（男女共通）",
    "price": 2091,
    "price_with_tax": 2300,
    "duration_min": 45,
    "category": "student",
    "description": "中学生まで カット＋シャンプー",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 1,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_170",
    "title": "カット&ヘッドスパ",
    "price": 4319,
    "price_with_tax": 4750,
    "duration_min": 75,
    "category": "beauty",
    "description": "頭皮、髪の毛の悩みをお持ちの方におすすめ\n専門知識で相談できます",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 2,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_20",
    "title": "シンプルカット",
    "price": 3182,
    "price_with_tax": 3500,
    "duration_min": 45,
    "category": "barber",
    "description": "カット＋シャンプー　顔そりを含みません",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 2,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_30",
    "title": "学生カット+SV（メンズ）",
    "price": 2546,
    "price_with_tax": 2800,
    "duration_min": 60,
    "category": "student",
    "description": "中学生まで　カット＋シャンプー+顔そり（眉カット込み）",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 2,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_180",
    "title": "カット&トリートメント",
    "price": 4546,
    "price_with_tax": 5000,
    "duration_min": 60,
    "category": "beauty",
    "description": "",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 3,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "GkcG2Io2rOeJh0Tk55km",
    "title": "学生顔そり（メンズ）",
    "price": 1364,
    "price_with_tax": 1500,
    "duration_min": 30,
    "category": "student",
    "description": "",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 10
  },
  {
    "id": "ZAltqpqxZczaupU3aF2x",
    "title": "学生デザインカラー",
    "price": 4228,
    "price_with_tax": 4650,
    "duration_min": 90,
    "category": "student",
    "description": "髪色を明るくor暗くします\n単品利用可能",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 11
  },
  {
    "id": "menu_100",
    "title": "デザインパーマ",
    "price": 6500,
    "price_with_tax": 7150,
    "duration_min": 120,
    "category": "barber",
    "description": "ハード(ツイスト)など強めのパーマ　当日変更可能",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 11,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_300",
    "title": "ファッションカラー(全体)",
    "price": 4410,
    "price_with_tax": 4850,
    "duration_min": 60,
    "category": "beauty",
    "description": "おしゃれ染め～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 11,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_110",
    "title": "ニュアンス・ソフトパーマ",
    "price": 5591,
    "price_with_tax": 6150,
    "duration_min": 120,
    "category": "barber",
    "description": "弱めなパーマ　当日変更可能",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 12,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_310",
    "title": "ファッションカラー(リタッチ)",
    "price": 3955,
    "price_with_tax": 4350,
    "duration_min": 60,
    "category": "beauty",
    "description": "おしゃれ染め～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 12,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_120",
    "title": "ポイントパーマ",
    "price": 4000,
    "price_with_tax": 4400,
    "duration_min": 60,
    "category": "barber",
    "description": "ロット5本まで　当日変更可能",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 13,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_280",
    "title": "ナチュラルカラー",
    "price": 3955,
    "price_with_tax": 4350,
    "duration_min": 60,
    "category": "beauty",
    "description": "白髪染め/全体染め～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 13,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_290",
    "title": "ナチュラルカラー(リタッチ)",
    "price": 3500,
    "price_with_tax": 3850,
    "duration_min": 60,
    "category": "beauty",
    "description": "白髪染め～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 14,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_270",
    "title": "ヘアマニキュア",
    "price": 4000,
    "price_with_tax": 4400,
    "duration_min": 60,
    "category": "beauty",
    "description": "～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 15,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_320",
    "title": "ブリーチ",
    "price": 4682,
    "price_with_tax": 5150,
    "duration_min": 120,
    "category": "beauty",
    "description": "金髪まで明るくします",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 15,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_330",
    "title": "ホイルカラー",
    "price": 637,
    "price_with_tax": 700,
    "duration_min": 90,
    "category": "beauty",
    "description": "ホイル1枚価格です",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 16,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "VSEislbaAEGIER6uPISv",
    "title": "ホイルカラー",
    "price": 637,
    "price_with_tax": 700,
    "duration_min": 60,
    "category": "barber",
    "description": "ホイル1枚価格です",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 21
  },
  {
    "id": "menu_240",
    "title": "デザインパーマ+カット",
    "price": 8000,
    "price_with_tax": 8800,
    "duration_min": 120,
    "category": "beauty",
    "description": "カット込み/トリートメントパーマ\n当日変更可能",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 21,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_250",
    "title": "ナチュラルパーマ+カット",
    "price": 7000,
    "price_with_tax": 7700,
    "duration_min": 120,
    "category": "beauty",
    "description": "カット込み～",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 21,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "nKebJGsm4iiPkkDTCFfg",
    "title": "学生カット+デザインパーマ",
    "price": 7682,
    "price_with_tax": 8450,
    "duration_min": 120,
    "category": "student",
    "description": "",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 21
  },
  {
    "id": "menu_130",
    "title": "デザインカラー",
    "price": 4228,
    "price_with_tax": 4650,
    "duration_min": 90,
    "category": "barber",
    "description": "カラーだけでもOKです",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 22,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_150",
    "title": "ナチュラルカラー",
    "price": 3773,
    "price_with_tax": 4150,
    "duration_min": 90,
    "category": "barber",
    "description": "白髪が気になる方にお勧めです\n単品利用もできます",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 23,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_140",
    "title": "ブリーチ",
    "price": 5137,
    "price_with_tax": 5650,
    "duration_min": 120,
    "category": "barber",
    "description": "金髪まで明るくします",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 24,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "0e52sw4PLR7zgz0dal6y",
    "title": "学生カット+髪質矯正",
    "price": 11364,
    "price_with_tax": 12500,
    "duration_min": 150,
    "category": "barber",
    "description": "",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 31
  },
  {
    "id": "Hz51j6SHfSx8WeGTh5d1",
    "title": "髪質改善+総合調髪",
    "price": 11819,
    "price_with_tax": 13000,
    "duration_min": 180,
    "category": "barber",
    "description": "カット+顔そり（眉カット込み）+髪質改善",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 31
  },
  {
    "id": "Vx4VZp4gayski9zj0X0o",
    "title": "学生カット+ストレート",
    "price": 9091,
    "price_with_tax": 10000,
    "duration_min": 180,
    "category": "student",
    "description": "",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 31
  },
  {
    "id": "dZIsdt3b1vdqVQKfXxzi",
    "title": "学生カット+髪質矯正",
    "price": 11364,
    "price_with_tax": 12500,
    "duration_min": 180,
    "category": "student",
    "description": "",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 31
  },
  {
    "id": "8UjE4jltXT2NcnN1bvPt",
    "title": "髪質改善+シンプルカット",
    "price": 11364,
    "price_with_tax": 12500,
    "duration_min": 180,
    "category": "barber",
    "description": "カット+髪質改善　顔そりは含まれてません",
    "available_staff_ids": [
      "brother"
    ],
    "order_priority": 32
  },
  {
    "id": "menu_190",
    "title": "縮毛矯正+カット",
    "price": 9091,
    "price_with_tax": 10000,
    "duration_min": 180,
    "category": "beauty",
    "description": "ストレートメニュー",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 41,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_90",
    "title": "婦人顔そり(中学生まで)",
    "price": 1819,
    "price_with_tax": 2000,
    "duration_min": 30,
    "category": "student",
    "description": "中学生まで　眉カット　襟そり込み",
    "available_staff_ids": [
      "mother",
      "brother",
      "OZJmONhYOuHDBZwKcTlD"
    ],
    "order_priority": 41,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "I1A3XxUbPRGSUbkMRkOl",
    "title": "学生眉カット",
    "price": 728,
    "price_with_tax": 800,
    "duration_min": 15,
    "category": "student",
    "description": "",
    "available_staff_ids": [
      "brother",
      "OZJmONhYOuHDBZwKcTlD",
      "mother"
    ],
    "order_priority": 42
  },
  {
    "id": "menu_200",
    "title": "髪質矯正+カット",
    "price": 11364,
    "price_with_tax": 12500,
    "duration_min": 180,
    "category": "beauty",
    "description": "初めてのストレートにおすすめです。　髪のダメージに合わせた調合や、お客様の仕上がりのイメージに合わせやすい施術です。\n",
    "available_staff_ids": [
      "brother",
      "mother"
    ],
    "order_priority": 42,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_50",
    "title": "顔剃 洗髪",
    "price": 2728,
    "price_with_tax": 3000,
    "duration_min": 40,
    "category": "barber",
    "description": "シャンプー＋顔そり（眉カット込み）",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 50,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_80",
    "title": "婦人顔そり(大人)",
    "price": 2500,
    "price_with_tax": 2750,
    "duration_min": 60,
    "category": "beauty",
    "description": "",
    "available_staff_ids": [
      "mother",
      "brother",
      "OZJmONhYOuHDBZwKcTlD"
    ],
    "order_priority": 51,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_230",
    "title": "眉カット・襟そり",
    "price": 1819,
    "price_with_tax": 2000,
    "duration_min": 15,
    "category": "beauty",
    "description": "",
    "available_staff_ids": [
      "mother",
      "brother",
      "OZJmONhYOuHDBZwKcTlD"
    ],
    "order_priority": 52,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_60",
    "title": "洗髪 セット",
    "price": 2273,
    "price_with_tax": 2500,
    "duration_min": 30,
    "category": "barber",
    "description": "シャンプー+セット　",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 60,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_70",
    "title": "眉カット",
    "price": 728,
    "price_with_tax": 800,
    "duration_min": 10,
    "category": "barber",
    "description": "",
    "available_staff_ids": [
      "father",
      "brother"
    ],
    "order_priority": 70,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  },
  {
    "id": "menu_340",
    "title": "カイロプラクティック",
    "price": 5000,
    "price_with_tax": 5500,
    "duration_min": 90,
    "category": "chiro",
    "description": "全身調整コース",
    "available_staff_ids": [
      "OZJmONhYOuHDBZwKcTlD"
    ],
    "order_priority": 340,
    "tenantId": "thuARQEfVeAC0Nbrwlw7"
  }
] as const

