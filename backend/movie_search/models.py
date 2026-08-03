"""Normalized search result model."""

from typing import Optional

class MovieSearchResult:
    """Normalized search result from external search sources."""
    def __init__(
        self,
        title: str,
        year: Optional[int],
        genre: str,
        poster_url: Optional[str],
        source_id: str,
        source: str,
        original_title: Optional[str] = None,
        media_type: str = "movie",
        tv_series_id: Optional[str] = None,
        season_number: Optional[int] = None,
        season_poster_url: Optional[str] = None,
        episode_count: Optional[int] = None,
        series_poster_url: Optional[str] = None,
        vote_average: Optional[float] = None,
        vote_count: Optional[int] = None,
    ):
        self.title = title
        self.year = year
        self.genre = genre
        self.poster_url = poster_url
        self.source_id = source_id
        self.source = source
        self.original_title = original_title
        self.media_type = media_type
        self.tv_series_id = tv_series_id
        self.season_number = season_number
        self.season_poster_url = season_poster_url
        self.episode_count = episode_count
        self.series_poster_url = series_poster_url
        self.vote_average = vote_average
        self.vote_count = vote_count

    def to_dict(self) -> dict:
        d = {
            "title": self.title,
            "year": self.year,
            "genre": self.genre,
            "poster_url": self.poster_url,
            "source_id": self.source_id,
            "source": self.source,
            "media_type": self.media_type,
        }
        if self.original_title:
            d["original_title"] = self.original_title
        if self.tv_series_id:
            d["tv_series_id"] = self.tv_series_id
        if self.season_number is not None:
            d["season_number"] = self.season_number
        if self.season_poster_url:
            d["season_poster_url"] = self.season_poster_url
        if self.episode_count is not None:
            d["episode_count"] = self.episode_count
        if self.series_poster_url:
            d["series_poster_url"] = self.series_poster_url
        return d


