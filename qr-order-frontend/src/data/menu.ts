import type { CartLine, MenuCategory, MenuItemDetail } from '../types/menu'

/**
 * Mock content for the UI phase. Copy and prices are the placeholder values
 * authored on the Figma frames; there is no API wiring yet.
 */
export const categories: MenuCategory[] = [
  { id: 'recommended', label: '추천', heading: '추천 메뉴' },
  { id: 'meal', label: '식사', heading: '식사' },
  { id: 'anju', label: '안주', heading: '안주' },
  { id: 'drink', label: '음료', heading: '음료' },
]

export const menuItems: MenuItemDetail[] = [
  {
    id: 'kimchi-jjigae',
    categoryId: 'recommended',
    name: '김치찌개',
    description: '돼지고기와 묵은지를 넣고 진하게 끓여낸 대표 메뉴입니다',
    price: 9000,
    soldOut: false,
    allergens: ['대두', '밀'],
    origin: '국내산',
    optionGroups: [
      {
        id: 'spiciness',
        label: '맵기 선택',
        required: true,
        type: 'radio',
        defaultOptionIds: ['normal'],
        options: [
          { id: 'normal', label: '보통', priceDelta: 0 },
          { id: 'very-spicy', label: '아주 맵게', priceDelta: 0 },
        ],
      },
      {
        id: 'extras',
        label: '추가 선택',
        required: false,
        type: 'check',
        options: [
          { id: 'rice', label: '공기밥 추가', priceDelta: 1000 },
          {
            id: 'fried-egg',
            label: '계란후라이',
            priceDelta: 2000,
            soldOut: true,
          },
        ],
      },
    ],
  },
  {
    id: 'jeyuk-bokkeum',
    categoryId: 'recommended',
    name: '제육볶음',
    description: '고추장 양념에 볶아낸 앞다리살, 2인분부터 주문 가능합니다',
    price: 13000,
    soldOut: false,
    allergens: ['대두', '돼지고기'],
    origin: '국내산',
    optionGroups: [
      {
        id: 'portion',
        label: '양 선택',
        required: true,
        type: 'radio',
        options: [
          { id: 'regular', label: '2인분', priceDelta: 0 },
          { id: 'large', label: '3인분', priceDelta: 6000 },
        ],
      },
      {
        id: 'extras',
        label: '추가 선택',
        required: false,
        type: 'check',
        options: [
          { id: 'rice', label: '공기밥 추가', priceDelta: 1000 },
          { id: 'lettuce', label: '상추 추가', priceDelta: 2000 },
        ],
      },
    ],
  },
  {
    id: 'haemul-pajeon',
    categoryId: 'recommended',
    name: '해물파전',
    description: '오징어와 새우를 넉넉히 올린 바삭한 파전',
    price: 15000,
    soldOut: true,
    allergens: ['밀', '갑각류'],
    origin: '수입산',
    optionGroups: [],
  },
  {
    id: 'doenjang-jjigae',
    categoryId: 'meal',
    name: '된장찌개',
    description: '6개월 숙성 된장으로 끓여낸 구수한 찌개',
    price: 8000,
    soldOut: false,
    allergens: ['대두'],
    origin: '국내산',
    optionGroups: [
      {
        id: 'extras',
        label: '추가 선택',
        required: false,
        type: 'check',
        options: [{ id: 'rice', label: '공기밥 추가', priceDelta: 1000 }],
      },
    ],
  },
  {
    id: 'bibimbap',
    categoryId: 'meal',
    name: '비빔밥',
    description: '제철 나물과 약고추장을 올린 한 그릇',
    price: 10000,
    soldOut: false,
    allergens: ['대두', '계란'],
    origin: '국내산',
    optionGroups: [
      {
        id: 'gochujang',
        label: '고추장 선택',
        required: true,
        type: 'radio',
        options: [
          { id: 'with', label: '고추장 넣기', priceDelta: 0 },
          { id: 'without', label: '고추장 빼기', priceDelta: 0 },
        ],
      },
    ],
  },
  {
    id: 'golbaengi-muchim',
    categoryId: 'anju',
    name: '골뱅이무침',
    description: '새콤달콤 무친 골뱅이에 소면을 곁들였습니다',
    price: 16300,
    soldOut: false,
    allergens: ['밀', '연체류'],
    origin: '수입산',
    optionGroups: [],
  },
  {
    id: 'dubu-kimchi',
    categoryId: 'anju',
    name: '두부김치',
    description: '따뜻한 두부와 볶은 김치를 함께 냅니다',
    price: 12000,
    soldOut: false,
    allergens: ['대두', '돼지고기'],
    origin: '국내산',
    optionGroups: [],
  },
  {
    id: 'cola',
    categoryId: 'drink',
    name: '콜라',
    description: '500ml 병',
    price: 2000,
    soldOut: false,
    optionGroups: [],
  },
  {
    id: 'soju',
    categoryId: 'drink',
    name: '소주',
    description: '주문 시 신분증을 확인할 수 있습니다',
    price: 4000,
    soldOut: false,
    optionGroups: [],
  },
]

/**
 * Seeded cart so the sticky bar renders its filled state, matching the S02
 * frame's "장바구니 2" and "주문하기 · 25,300원".
 */
export const initialCart: CartLine[] = [
  { itemId: 'kimchi-jjigae', quantity: 1, unitPrice: 9000 },
  { itemId: 'golbaengi-muchim', quantity: 1, unitPrice: 16300 },
]
