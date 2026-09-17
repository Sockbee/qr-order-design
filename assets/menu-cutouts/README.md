# 주류·음료 투명 배경 원본

2026-09-17 내장 ImageGen 이미지 편집 도구로 배경을 제거한 PNG 4개입니다.
입력은 Downloads의 `소주.png`, `맥주.png`, `콜라.jpg`, `사이다.jpg`입니다.
생성형 편집 결과이므로 원본 사진과 픽셀 단위로 동일한 추출물은 아닙니다.
제품 외곽의 배경은 alpha=0이며 제품 라벨의 흰색은 유지합니다.

| 메뉴 ID | 편집 결과 | 배포 파일 |
|---|---|---|
| `soju` | [소주.png](소주.png) | [WebP](../menu/soju/4e77c7c0e6430908.webp) |
| `beer` | [맥주.png](맥주.png) | [WebP](../menu/beer/868f0a63f3367eef.webp) |
| `cola` | [콜라.png](콜라.png) | [WebP](../menu/cola/23a3c603f4c08861.webp) |
| `cider` | [사이다.png](사이다.png) | [WebP](../menu/cider/0fc3194af32888bc.webp) |

원본 파일은 수정하지 않았습니다. 배포용 WebP는 다음 명령으로 생성합니다.

```bash
.local-data/menu-images-venv/bin/python scripts/menu-images/prepare.py assets/menu-cutouts --menus soju beer cola cider
```

## 사용한 프롬프트

아래 문장의 `{id}`를 `soju`, `beer`, `cola`, `cider`로 각각 바꾸고 해당 원본 사진 한 장을
`referenced_image_paths`로 제공했습니다. 내장 도구를 사용했으며 별도 API/CLI 생성은 하지 않았습니다.

> Use case: background-extraction. Edit target: the single provided product photograph ({id}). Remove ONLY the plain white background outside the product silhouette and replace it with true alpha transparency. Produce one transparent PNG cutout of this exact same product, upright, whole and uncropped, closely framed with a small transparent margin. Preserve the original bottle/can shape and aspect ratio, product colors, cap, metallic rim, highlights, all logos and Korean/English lettering and foreground marks. White printing and white label areas ON the product must stay opaque white. Preserve all foreground detail; do not redesign, retype text, stylize, add objects, invent details, add shadow or reflections. Background must be genuinely transparent, not solid white and not a drawn checkerboard. This is a background removal edit of an existing menu asset.
