"""Quick test: verify that search_movies strips season info from queries."""

from movie_search import search_movies


def test(description, query):
    print(f"=== {description} ===")
    print(f"  Query: {query}")
    result = search_movies(query, "auto")
    print(f"  Results: {len(result)}")
    for r in result[:3]:
        tv_tag = " [TV]" if r.get("media_type") == "tv" else ""
        print(f"    - {r['title']} ({r.get('year', '')}) [{r['source']}]{tv_tag}")
    print()


test("Chinese with season", "黑袍纠察队 第四季")
test("English with season", "The Boys Season 4")
test("Combined with season", "黑袍纠察队 第四季 / The Boys Season 4")
test("Without season (control)", "黑袍纠察队")
test("English S pattern", "The Boys S4")
test("Chinese numeral season", "权力的游戏 第一季")
