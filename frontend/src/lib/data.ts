export type MenuItem = {
  id: string;
  name: string;
  nameUr?: string;
  slug: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  price: number;
  effectivePrice?: number;
  calories?: number;
  prepTimeMinutes: number;
  imageUrl: string;
  categorySlug: string;
  categoryName: string;
  isBestSeller?: boolean;
  isNew?: boolean;
  discountPercent?: number;
  isVegetarian?: boolean;
  isHalal?: boolean;
  isAvailable?: boolean;
};

export const BRANCH = {
  name: 'Kashmiri Daal Chawal',
  tagline: 'Home of authentic Kashmiri comfort',
  address: 'Hall Road, Lahore, Pakistan',
  phone: '+92 42 3575 0000',
  email: 'hello@kashmiridaalchawal.pk',
  currency: 'PKR',
  taxRate: 0.05,
  deliveryFee: 150,
  freeDeliveryAbove: 2000,
  hours: [
    { day: 'Mon – Thu', hours: '11:00 – 22:00' },
    { day: 'Friday', hours: '11:00 – 23:00' },
    { day: 'Saturday', hours: '12:00 – 23:00' },
    { day: 'Sunday', hours: '12:00 – 21:00' },
  ],
  mapEmbed:
    'https://maps.google.com/maps?q=Hall%20Road%20Lahore%20Pakistan&t=&z=16&ie=UTF8&iwloc=&output=embed',
  partners: ['Foodpanda', 'Bykea', 'Careem'],
};

export const CATEGORIES = [
  { slug: 'mains', name: 'Mains', nameUr: 'مین کورس' },
  { slug: 'sides', name: 'Sides', nameUr: 'ساتھ' },
  { slug: 'drinks', name: 'Drinks', nameUr: 'مشروبات' },
];

export const MENU_ITEMS: MenuItem[] = [
  {
    id: '11000000-0000-4000-8000-000000000001',
    name: 'Boiled Rice',
    nameUr: 'ابلا ہوا چاول',
    slug: 'boiled-rice',
    description:
      'Fragrant long-grain basmati rice, steamed to perfection — the foundation of every Kashmiri plate.',
    ingredients: ['Basmati rice', 'Salt', 'Water'],
    allergens: [],
    price: 250,
    calories: 210,
    prepTimeMinutes: 10,
    imageUrl:
      'https://images.unsplash.com/photo-1756821753095-64134f5c0c5c?auto=format&fit=crop&w=1200&q=80',
    categorySlug: 'mains',
    categoryName: 'Mains',
    isBestSeller: true,
    isVegetarian: true,
    isHalal: true,
    isAvailable: true,
  },
  {
    id: '11000000-0000-4000-8000-000000000003',
    name: 'Chicken Pulao',
    nameUr: 'چکن پلاؤ',
    slug: 'chicken-pulao',
    description:
      'Tender chicken and basmati rice cooked together with whole spices and caramelised onions.',
    ingredients: ['Chicken', 'Basmati rice', 'Onion', 'Bay leaf', 'Cinnamon', 'Cardamom'],
    allergens: [],
    price: 550,
    discountPercent: 10,
    effectivePrice: 495,
    calories: 520,
    prepTimeMinutes: 30,
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1200&q=80',
    categorySlug: 'mains',
    categoryName: 'Mains',
    isBestSeller: true,
    isHalal: true,
    isAvailable: true,
  },
  {
    id: '11000000-0000-4000-8000-000000000004',
    name: 'Chicken Biryani',
    nameUr: 'چکن بریانی',
    slug: 'chicken-biryani',
    description:
      'Layered aromatic biryani with marinated chicken, saffron milk and fried onions. Our signature dish.',
    ingredients: ['Chicken', 'Basmati rice', 'Yogurt', 'Saffron', 'Fried onion', 'Biryani masala'],
    allergens: ['Dairy (yogurt)'],
    price: 650,
    calories: 650,
    prepTimeMinutes: 40,
    imageUrl:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80',
    categorySlug: 'mains',
    categoryName: 'Mains',
    isBestSeller: true,
    isNew: true,
    isHalal: true,
    isAvailable: true,
  },
  {
    id: '11000000-0000-4000-8000-000000000005',
    name: 'Shami Kebab',
    nameUr: 'شامی کباب',
    slug: 'shami-kebab',
    description:
      'Finely minced meat and lentil patties, shallow-fried until golden. Crisp outside, soft inside.',
    ingredients: ['Minced beef', 'Chana dal', 'Egg', 'Onion', 'Garam masala'],
    allergens: ['Egg'],
    price: 380,
    calories: 320,
    prepTimeMinutes: 15,
    imageUrl: '/images/menu/shami-kebab.jpg',
    categorySlug: 'sides',
    categoryName: 'Sides',
    isBestSeller: true,
    isHalal: true,
    isAvailable: true,
  },
  {
    id: 'd1',
    name: 'Mineral Water',
    slug: 'mineral-water',
    description: 'Still mineral water 500ml.',
    ingredients: ['Water'],
    allergens: [],
    price: 60,
    calories: 0,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/mineral-water.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd2',
    name: 'Coca-Cola',
    slug: 'coca-cola',
    description: 'Classic Coca-Cola 330ml.',
    ingredients: ['Carbonated water', 'Sugar'],
    allergens: [],
    price: 100,
    calories: 139,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/coca-cola.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd3',
    name: 'Pepsi',
    slug: 'pepsi',
    description: 'Pepsi 330ml.',
    ingredients: ['Carbonated water', 'Sugar'],
    allergens: [],
    price: 100,
    calories: 141,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/pepsi.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd4',
    name: '7UP',
    slug: '7up',
    description: 'Refreshing lemon-lime 330ml.',
    ingredients: ['Carbonated water', 'Sugar'],
    allergens: [],
    price: 100,
    calories: 136,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/7up.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd5',
    name: 'Sprite',
    slug: 'sprite',
    description: 'Sprite 330ml.',
    ingredients: ['Carbonated water', 'Sugar'],
    allergens: [],
    price: 100,
    calories: 136,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/sprite.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd6',
    name: 'Diet Coke',
    slug: 'diet-coke',
    description: 'Diet Coke 330ml.',
    ingredients: ['Carbonated water', 'Sweeteners'],
    allergens: [],
    price: 100,
    calories: 1,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/diet-coke.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd7',
    name: 'Fanta',
    slug: 'fanta',
    description: 'Orange Fanta 330ml.',
    ingredients: ['Carbonated water', 'Orange juice'],
    allergens: [],
    price: 100,
    calories: 145,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/fanta.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd8',
    name: 'Tango',
    slug: 'tango',
    description: 'Tango Orange 330ml.',
    ingredients: ['Carbonated water', 'Orange'],
    allergens: [],
    price: 100,
    calories: 140,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/tango.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
  {
    id: 'd9',
    name: 'Rubicon',
    slug: 'rubicon',
    description: 'Rubicon Mango 330ml.',
    ingredients: ['Carbonated water', 'Mango'],
    allergens: [],
    price: 120,
    calories: 150,
    prepTimeMinutes: 1,
    imageUrl: '/images/menu/rubicon.jpg',
    categorySlug: 'drinks',
    categoryName: 'Drinks',
    isAvailable: true,
  },
];

export const REVIEWS = [
  {
    id: '1',
    name: 'Ali R.',
    rating: 5,
    title: 'Best daal chawal on Hall Road',
    comment: 'The chicken biryani tastes like home. Generous portions and friendly staff.',
  },
  {
    id: '2',
    name: 'Fatima S.',
    rating: 5,
    title: 'Proper Kashmiri flavours',
    comment: 'Came for daal rice, stayed for the shami kebabs. Will order again.',
  },
  {
    id: '3',
    name: 'Hassan M.',
    rating: 5,
    title: 'Comfort food perfection',
    comment:
      'Warm spices, honest prices, and the rice is always perfect. Take away from Hall Road is quick.',
  },
];

export const OFFERS = [
  {
    code: 'WELCOME10',
    title: 'Welcome 10%',
    detail: '10% off your first online order over Rs 1,000',
  },
  {
    code: 'BIRYANI200',
    title: 'Biryani Night',
    detail: 'Rs 200 off when your order is Rs 1,000 or more',
  },
];

/** Format amount in Pakistani Rupees */
export function formatPKR(n: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

/** @deprecated use formatPKR */
export const formatGBP = formatPKR;

export function itemPrice(item: MenuItem) {
  if (item.effectivePrice != null) return item.effectivePrice;
  if (item.discountPercent) return Math.round(item.price * (1 - item.discountPercent / 100));
  return item.price;
}
