"""Venue and city to country mapping.

Cricsheet records a venue name and usually a city, but no country. Home/away
splits and "how does this batter travel" questions need one, so we carry a
lookup for the grounds that host international cricket. Anything unmatched is
left blank and simply drops out of the home/away split rather than being
guessed at.
"""
from __future__ import annotations

CITY_COUNTRY: dict[str, str] = {
    # India
    "Mumbai": "India", "Delhi": "India", "Kolkata": "India", "Chennai": "India",
    "Bengaluru": "India", "Bangalore": "India", "Hyderabad": "India",
    "Ahmedabad": "India", "Mohali": "India", "Chandigarh": "India",
    "Nagpur": "India", "Pune": "India", "Rajkot": "India", "Indore": "India",
    "Ranchi": "India", "Visakhapatnam": "India", "Dharamsala": "India",
    "Guwahati": "India", "Lucknow": "India", "Kanpur": "India", "Jaipur": "India",
    "Cuttack": "India", "Kochi": "India", "Thiruvananthapuram": "India",
    "Dehradun": "India", "Raipur": "India", "Vadodara": "India", "Jamtha": "India",
    # Australia
    "Melbourne": "Australia", "Sydney": "Australia", "Adelaide": "Australia",
    "Perth": "Australia", "Brisbane": "Australia", "Hobart": "Australia",
    "Canberra": "Australia", "Geelong": "Australia", "Cairns": "Australia",
    "Townsville": "Australia", "Darwin": "Australia", "Launceston": "Australia",
    "Alice Springs": "Australia",
    # England
    "London": "England", "Manchester": "England", "Birmingham": "England",
    "Leeds": "England", "Nottingham": "England", "Southampton": "England",
    "Cardiff": "England", "Bristol": "England", "Chester-le-Street": "England",
    "Durham": "England", "Taunton": "England", "Hove": "England",
    "Chelmsford": "England", "Northampton": "England", "Leicester": "England",
    "Derby": "England", "Worcester": "England", "Canterbury": "England",
    # Pakistan / UAE
    "Karachi": "Pakistan", "Lahore": "Pakistan", "Rawalpindi": "Pakistan",
    "Multan": "Pakistan", "Faisalabad": "Pakistan", "Peshawar": "Pakistan",
    "Sialkot": "Pakistan", "Quetta": "Pakistan", "Gujranwala": "Pakistan",
    "Dubai": "United Arab Emirates", "Abu Dhabi": "United Arab Emirates",
    "Sharjah": "United Arab Emirates",
    # South Africa
    "Johannesburg": "South Africa", "Cape Town": "South Africa",
    "Durban": "South Africa", "Centurion": "South Africa",
    "Port Elizabeth": "South Africa", "Gqeberha": "South Africa",
    "Bloemfontein": "South Africa", "Paarl": "South Africa",
    "Potchefstroom": "South Africa", "East London": "South Africa",
    "Kimberley": "South Africa", "Benoni": "South Africa",
    # New Zealand
    "Auckland": "New Zealand", "Wellington": "New Zealand",
    "Christchurch": "New Zealand", "Hamilton": "New Zealand",
    "Napier": "New Zealand", "Dunedin": "New Zealand", "Nelson": "New Zealand",
    "Mount Maunganui": "New Zealand", "Queenstown": "New Zealand",
    "Whangarei": "New Zealand", "Tauranga": "New Zealand", "Lincoln": "New Zealand",
    # West Indies
    "Bridgetown": "West Indies", "Kingston": "West Indies",
    "Port of Spain": "West Indies", "Gros Islet": "West Indies",
    "St George's": "West Indies", "Providence": "West Indies",
    "North Sound": "West Indies", "Basseterre": "West Indies",
    "Kingstown": "West Indies", "Roseau": "West Indies", "Georgetown": "West Indies",
    "Lauderhill": "West Indies", "Tarouba": "West Indies",
    # Sri Lanka
    "Colombo": "Sri Lanka", "Kandy": "Sri Lanka", "Galle": "Sri Lanka",
    "Dambulla": "Sri Lanka", "Pallekele": "Sri Lanka", "Hambantota": "Sri Lanka",
    "Moratuwa": "Sri Lanka", "Katunayake": "Sri Lanka",
    # Bangladesh
    "Dhaka": "Bangladesh", "Chattogram": "Bangladesh", "Chittagong": "Bangladesh",
    "Khulna": "Bangladesh", "Sylhet": "Bangladesh", "Fatullah": "Bangladesh",
    "Bogra": "Bangladesh", "Mirpur": "Bangladesh",
    # Zimbabwe / Ireland / Scotland / Afghanistan / others
    "Harare": "Zimbabwe", "Bulawayo": "Zimbabwe", "Kwekwe": "Zimbabwe",
    "Dublin": "Ireland", "Belfast": "Ireland", "Bready": "Ireland",
    "Malahide": "Ireland", "Edinburgh": "Scotland", "Aberdeen": "Scotland",
    "Glasgow": "Scotland", "Amstelveen": "Netherlands", "Rotterdam": "Netherlands",
    "The Hague": "Netherlands", "Deventer": "Netherlands",
    "Kabul": "Afghanistan", "Greater Noida": "India", "Dehradun ": "India",
    "Windhoek": "Namibia", "Kampala": "Uganda", "Nairobi": "Kenya",
    "Muscat": "Oman", "Al Amerat": "Oman", "Kirtipur": "Nepal",
    "Kathmandu": "Nepal", "Singapore": "Singapore", "Kuala Lumpur": "Malaysia",
    "Hong Kong": "Hong Kong", "Doha": "Qatar", "Al Khobar": "Saudi Arabia",
}

# Venues whose city is absent or ambiguous in the source data.
VENUE_COUNTRY: dict[str, str] = {
    "Lord's": "England",
    "The Rose Bowl": "England",
    "Kennington Oval": "England",
    "Riverside Ground": "England",
    "Sophia Gardens": "Wales",
    "Edgbaston": "England",
    "Trent Bridge": "England",
    "Headingley": "England",
    "Old Trafford": "England",
    "Melbourne Cricket Ground": "Australia",
    "Sydney Cricket Ground": "Australia",
    "Adelaide Oval": "Australia",
    "W.A.C.A. Ground": "Australia",
    "Perth Stadium": "Australia",
    "Brisbane Cricket Ground": "Australia",
    "Bellerive Oval": "Australia",
    "Manuka Oval": "Australia",
    "Eden Gardens": "India",
    "Wankhede Stadium": "India",
    "M Chinnaswamy Stadium": "India",
    "MA Chidambaram Stadium": "India",
    "Feroz Shah Kotla": "India",
    "Arun Jaitley Stadium": "India",
    "Narendra Modi Stadium": "India",
    "Sardar Patel Stadium": "India",
    "Rajiv Gandhi International Stadium": "India",
    "Newlands": "South Africa",
    "The Wanderers Stadium": "South Africa",
    "Kingsmead": "South Africa",
    "SuperSport Park": "South Africa",
    "St George's Park": "South Africa",
    "Eden Park": "New Zealand",
    "Basin Reserve": "New Zealand",
    "Hagley Oval": "New Zealand",
    "Seddon Park": "New Zealand",
    "Bay Oval": "New Zealand",
    "Sharjah Cricket Stadium": "United Arab Emirates",
    "Dubai International Cricket Stadium": "United Arab Emirates",
    "Sheikh Zayed Stadium": "United Arab Emirates",
    "Gaddafi Stadium": "Pakistan",
    "National Stadium": "Pakistan",
    "Rawalpindi Cricket Stadium": "Pakistan",
    "Galle International Stadium": "Sri Lanka",
    "R Premadasa Stadium": "Sri Lanka",
    "Sinhalese Sports Club Ground": "Sri Lanka",
    "Pallekele International Cricket Stadium": "Sri Lanka",
    "Shere Bangla National Stadium": "Bangladesh",
    "Zahur Ahmed Chowdhury Stadium": "Bangladesh",
    "Kensington Oval": "West Indies",
    "Sabina Park": "West Indies",
    "Queen's Park Oval": "West Indies",
    "Darren Sammy National Cricket Stadium": "West Indies",
    "Sir Vivian Richards Stadium": "West Indies",
    "Harare Sports Club": "Zimbabwe",
    "Queens Sports Club": "Zimbabwe",
    "Civil Service Cricket Club": "Ireland",
    "The Village": "Ireland",
}

# Which country each international team calls home, for the home/away split.
TEAM_HOME: dict[str, str] = {
    "India": "India", "Australia": "Australia", "England": "England",
    "Pakistan": "Pakistan", "South Africa": "South Africa",
    "New Zealand": "New Zealand", "Sri Lanka": "Sri Lanka",
    "Bangladesh": "Bangladesh", "West Indies": "West Indies",
    "Afghanistan": "Afghanistan", "Zimbabwe": "Zimbabwe", "Ireland": "Ireland",
    "Scotland": "Scotland", "Netherlands": "Netherlands", "Nepal": "Nepal",
    "Oman": "Oman", "United Arab Emirates": "United Arab Emirates",
    "Namibia": "Namibia", "Kenya": "Kenya", "Canada": "Canada",
    "United States of America": "United States of America",
    "Papua New Guinea": "Papua New Guinea", "Hong Kong": "Hong Kong",
}


def country_for(venue: str, city: str) -> str:
    if venue in VENUE_COUNTRY:
        return VENUE_COUNTRY[venue]
    if city in CITY_COUNTRY:
        return CITY_COUNTRY[city]
    for name, country in VENUE_COUNTRY.items():
        if name in venue:
            return country
    return ""
