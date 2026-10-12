"""Template content for each platform. This is *sample output*: the content-generation agent is not built yet,
so everything produced here is labelled Simulated in the interface.

The point it demonstrates is that one product is written differently per channel (limits, tone, structure)."""
from seed.catalog_data import BRAND


def size_text(value, unit) -> str:
    if value is None:
        return "size not stated"
    number = int(value) if float(value).is_integer() else value
    return f"{number} {unit}".strip() if unit else f"{number}"


def _fit(text: str, limit: int | None) -> str:
    if limit is None or len(text) <= limit:
        return text
    return text[: limit - 1].rstrip(" ,;|-") + "…"


def _list_ing(ing: list[str]) -> str:
    return ", ".join(ing)


def _bullets(templates: list[str], ctx: dict, count: int, limit: int, caps_lead: bool = False) -> list[str]:
    out = []
    for i, tpl in enumerate(templates[:count]):
        text = tpl.format(**ctx)
        if caps_lead and ":" not in text[:24]:
            lead = ["MADE WITH", "READY TO ENJOY", "FRESH", "GREAT TASTE", "ALLERGEN INFORMATION"][i % 5]
            text = f"{lead}: {text}"
        out.append(_fit(text, limit))
    return out


def build_content(product: dict, cat: dict, platform: dict) -> dict:
    """product needs: line, flavour, ingredients, allergens, weight_value, weight_unit, price, kw. Returns one platform's content."""
    rules = platform["rules"]
    key = platform["key"]
    size = size_text(product["weight_value"], product["weight_unit"])
    ing = _list_ing(product["ingredients"])
    ctx = dict(name=product["line"], size=size, flavour=product["flavour"], ing=ing.lower(), allergens=product["allergens"])
    line, flavour = product["line"], product["flavour"]
    keywords = [product["kw"], f"{cat['noun']} {size}", f"{BRAND.lower()} {line.lower()}"]
    attrs = {"brand": BRAND, "category": cat["name"], "weight": size, "allergens": product["allergens"], "country_of_origin": cat["origin"]}
    title_ar = None

    if key == "amazon_in":
        title = _fit(f"{BRAND} {line}, {size} | {flavour} | Pack of 1", rules["title_limit"])
        bullets = _bullets(cat["bullets"], ctx, rules["bullet_count"], rules["bullet_limit"], caps_lead=True)
        desc = _fit(f"{BRAND} {line} ({size}). {flavour}. Made with {ing.lower()}. {product['allergens']} "
                    f"Shelf life: {cat['shelf_life']}. Store in a cool, dry place.", rules["desc_limit"])
    elif key == "flipkart":
        title = _fit(f"{BRAND} {line} ({size})", rules["title_limit"])
        bullets = [_fit(t, rules["bullet_limit"]) for t in [
            f"Net quantity: {size}", f"Flavour: {flavour}", f"Key ingredients: {ing}",
            f"Shelf life: {cat['shelf_life']}", product["allergens"]][: rules["bullet_count"]]]
        desc = _fit(f"{flavour}. {BRAND} {line} in a {size} pack. Ingredients: {ing}.", rules["desc_limit"])
        attrs = {"brand": BRAND, "category": cat["name"], "net_quantity": size, "flavour": flavour}
    elif key == "noon":
        title = _fit(f"{BRAND} {line} - {size}", rules["title_limit"])
        title_ar = f"{BRAND} {cat['noun_ar']} {size}"
        bullets = _bullets(cat["bullets"][:3] + [cat["bullets"][-1]], ctx, rules["bullet_count"], rules["bullet_limit"])
        desc = _fit(f"{BRAND} {line}: {flavour}. Made with {ing.lower()}. {product['allergens']} Country of origin: {cat['origin']}.", rules["desc_limit"])
    elif key == "blinkit":
        title = _fit(f"{BRAND} {line} ({size})", rules["title_limit"])
        bullets = [_fit(t, rules["bullet_limit"]) for t in [f"Pack: {size}", f"{flavour}", product["allergens"]][: rules["bullet_count"]]]
        desc = _fit(f"{flavour}. Delivered fresh in minutes.", rules["desc_limit"])
        attrs = {"brand": BRAND, "pack_size": size, "shelf_life": cat["shelf_life"]}
    else:  # website: long-form, story-led
        title = f"{BRAND} {line} {size}"
        bullets = []
        desc = (f"{flavour}. Our {line.lower()} is made with {ing.lower()}, carefully prepared so every {cat['noun']} "
                f"tastes the way it should. Available in a {size} pack. {product['allergens']} "
                f"Best enjoyed within {cat['shelf_life']} of manufacture.")
        attrs = {"brand": BRAND, "ingredients": ing, "allergens": product["allergens"], "nutritional_info": cat["nutrition"] + " (sample values)"}

    return dict(title=title, title_ar=title_ar, bullets=bullets, description=desc, attributes=attrs, keywords=keywords)


def image_checks(images: list[dict], image_rules: dict) -> list[dict]:
    """Check a product's images against one platform's (configurable, illustrative) image rules."""
    front = next((i for i in images if i["kind"] == "front"), None)
    checks = []
    if front is None:
        return [dict(rule="Main image present", ok=False, detail="No front image found")]
    longest = max(front["width"], front["height"])
    checks.append(dict(rule=f"Resolution at least {image_rules['min_px']} px", ok=longest >= image_rules["min_px"], detail=f"{longest} px on the longest side"))
    if image_rules.get("white_bg"):
        checks.append(dict(rule="Main image on a plain white background", ok=bool(front["bg_white"]), detail="White background" if front["bg_white"] else "Background is not plain white"))
    checks.append(dict(rule=f"At least {image_rules['min_count']} images", ok=len(images) >= image_rules["min_count"], detail=f"{len(images)} image(s) uploaded"))
    return checks
