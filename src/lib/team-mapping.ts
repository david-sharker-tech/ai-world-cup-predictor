// 48 支球队的英文 → FIFA 三字母代码 + 中文名 + 旗帜 emoji 映射。
// 英文名以 wc2026_schedule.json 的 groups 字段为权威源。
// FIFA 代码采用 IOC / FIFA 三字母标准。

export interface TeamMapping {
  /** FIFA 三字母代码,作 teams.id 主键 */
  code: string;
  /** wc2026_schedule.json 中的英文名(精确匹配) */
  nameEn: string;
  /** 中文名 */
  nameZh: string;
  /** 国旗 emoji */
  flag: string;
}

export const TEAM_MAPPINGS: TeamMapping[] = [
  // 小组 A
  { code: 'MEX', nameEn: 'Mexico',         nameZh: '墨西哥',   flag: '🇲🇽' },
  { code: 'RSA', nameEn: 'South Africa',   nameZh: '南非',     flag: '🇿🇦' },
  { code: 'KOR', nameEn: 'South Korea',    nameZh: '韩国',     flag: '🇰🇷' },
  { code: 'CZE', nameEn: 'Czechia',        nameZh: '捷克',     flag: '🇨🇿' },
  // 小组 B
  { code: 'CAN', nameEn: 'Canada',         nameZh: '加拿大',   flag: '🇨🇦' },
  { code: 'BIH', nameEn: 'Bosnia and Herzegovina', nameZh: '波黑', flag: '🇧🇦' },
  { code: 'QAT', nameEn: 'Qatar',          nameZh: '卡塔尔',   flag: '🇶🇦' },
  { code: 'SUI', nameEn: 'Switzerland',    nameZh: '瑞士',     flag: '🇨🇭' },
  // 小组 C
  { code: 'BRA', nameEn: 'Brazil',         nameZh: '巴西',     flag: '🇧🇷' },
  { code: 'MAR', nameEn: 'Morocco',        nameZh: '摩洛哥',   flag: '🇲🇦' },
  { code: 'HAI', nameEn: 'Haiti',          nameZh: '海地',     flag: '🇭🇹' },
  { code: 'SCO', nameEn: 'Scotland',       nameZh: '苏格兰',   flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  // 小组 D
  { code: 'USA', nameEn: 'USA',            nameZh: '美国',     flag: '🇺🇸' },
  { code: 'PAR', nameEn: 'Paraguay',       nameZh: '巴拉圭',   flag: '🇵🇾' },
  { code: 'AUS', nameEn: 'Australia',      nameZh: '澳大利亚', flag: '🇦🇺' },
  { code: 'TUR', nameEn: 'Turkey',         nameZh: '土耳其',   flag: '🇹🇷' },
  // 小组 E
  { code: 'GER', nameEn: 'Germany',        nameZh: '德国',     flag: '🇩🇪' },
  { code: 'CUW', nameEn: 'Curacao',        nameZh: '库拉索',   flag: '🇨🇼' },
  { code: 'CIV', nameEn: 'Ivory Coast',    nameZh: '科特迪瓦', flag: '🇨🇮' },
  { code: 'ECU', nameEn: 'Ecuador',        nameZh: '厄瓜多尔', flag: '🇪🇨' },
  // 小组 F
  { code: 'NED', nameEn: 'Netherlands',    nameZh: '荷兰',     flag: '🇳🇱' },
  { code: 'JPN', nameEn: 'Japan',          nameZh: '日本',     flag: '🇯🇵' },
  { code: 'SWE', nameEn: 'Sweden',         nameZh: '瑞典',     flag: '🇸🇪' },
  { code: 'TUN', nameEn: 'Tunisia',        nameZh: '突尼斯',   flag: '🇹🇳' },
  // 小组 G
  { code: 'BEL', nameEn: 'Belgium',        nameZh: '比利时',   flag: '🇧🇪' },
  { code: 'EGY', nameEn: 'Egypt',          nameZh: '埃及',     flag: '🇪🇬' },
  { code: 'IRN', nameEn: 'Iran',           nameZh: '伊朗',     flag: '🇮🇷' },
  { code: 'NZL', nameEn: 'New Zealand',    nameZh: '新西兰',   flag: '🇳🇿' },
  // 小组 H
  { code: 'ESP', nameEn: 'Spain',          nameZh: '西班牙',   flag: '🇪🇸' },
  { code: 'CPV', nameEn: 'Cape Verde',     nameZh: '佛得角',   flag: '🇨🇻' },
  { code: 'KSA', nameEn: 'Saudi Arabia',   nameZh: '沙特阿拉伯', flag: '🇸🇦' },
  { code: 'URU', nameEn: 'Uruguay',        nameZh: '乌拉圭',   flag: '🇺🇾' },
  // 小组 I
  { code: 'FRA', nameEn: 'France',         nameZh: '法国',     flag: '🇫🇷' },
  { code: 'SEN', nameEn: 'Senegal',        nameZh: '塞内加尔', flag: '🇸🇳' },
  { code: 'IRQ', nameEn: 'Iraq',           nameZh: '伊拉克',   flag: '🇮🇶' },
  { code: 'NOR', nameEn: 'Norway',         nameZh: '挪威',     flag: '🇳🇴' },
  // 小组 J
  { code: 'ARG', nameEn: 'Argentina',      nameZh: '阿根廷',   flag: '🇦🇷' },
  { code: 'ALG', nameEn: 'Algeria',        nameZh: '阿尔及利亚', flag: '🇩🇿' },
  { code: 'AUT', nameEn: 'Austria',        nameZh: '奥地利',   flag: '🇦🇹' },
  { code: 'JOR', nameEn: 'Jordan',         nameZh: '约旦',     flag: '🇯🇴' },
  // 小组 K
  { code: 'POR', nameEn: 'Portugal',       nameZh: '葡萄牙',   flag: '🇵🇹' },
  { code: 'COD', nameEn: 'DR Congo',       nameZh: '刚果(金)', flag: '🇨🇩' },
  { code: 'UZB', nameEn: 'Uzbekistan',     nameZh: '乌兹别克斯坦', flag: '🇺🇿' },
  { code: 'COL', nameEn: 'Colombia',       nameZh: '哥伦比亚', flag: '🇨🇴' },
  // 小组 L
  { code: 'ENG', nameEn: 'England',        nameZh: '英格兰',   flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'CRO', nameEn: 'Croatia',        nameZh: '克罗地亚', flag: '🇭🇷' },
  { code: 'GHA', nameEn: 'Ghana',          nameZh: '加纳',     flag: '🇬🇭' },
  { code: 'PAN', nameEn: 'Panama',         nameZh: '巴拿马',   flag: '🇵🇦' },
];

const BY_EN = new Map(TEAM_MAPPINGS.map(t => [t.nameEn, t]));

export function findByEnglishName(name: string): TeamMapping | undefined {
  return BY_EN.get(name);
}
