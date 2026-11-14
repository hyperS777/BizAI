"""
Expense model.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String(300), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String(100), nullable=True)  # e.g., "rent", "utilities", "supplies"
    vendor = Column(String(200), nullable=True)
    payment_mode = Column(String(50), default="bank_transfer")
    receipt_url = Column(Text, nullable=True)
    vendor_gstin = Column(String(20), nullable=True)
    gst_amount = Column(Float, default=0.0)
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by_user = relationship("User", back_populates="expenses")

    def __repr__(self):
        return f"<Expense {self.description}: {self.amount}>"
