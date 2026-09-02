from sqlalchemy import Column, Integer, String, Text
from app.database import Base

class RestaurantSetting(Base):
    __tablename__ = "restaurant_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)
