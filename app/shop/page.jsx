'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, X, Plus, Minus, AlertCircle, CheckCircle, Loader } from 'lucide-react';

const StripeCart = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [discountError, setDiscountError] = useState(null);
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [step, setStep] = useState('cart'); // 'cart' or 'checkout'
  const [successMessage, setSuccessMessage] = useState('');

  const [customerData, setCustomerData] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'Canada'
  });

  // Get backend URL from environment
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

  // Fetch products from Stripe
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${BACKEND_URL}/api/products`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        setProducts(data.products || []);
      } catch (err) {
        setError('Unable to load products. Please check your connection and try again.');
        console.error('Product fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (BACKEND_URL) {
      fetchProducts();
    } else {
      setError('Backend URL not configured');
      setLoading(false);
    }
  }, [BACKEND_URL]);

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const applyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountError('Please enter a discount code');
      return;
    }

    try {
      setDiscountError(null);
      const response = await fetch(`${BACKEND_URL}/api/validate-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCode.toUpperCase() })
      });

      if (!response.ok) throw new Error('Invalid discount code');
      const data = await response.json();
      setAppliedDiscount(data.discount);
      setDiscountCode('');
    } catch (err) {
      setDiscountError(err.message || 'Invalid discount code');
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError(null);
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateDiscount = () => {
    if (!appliedDiscount) return 0;
    const subtotal = calculateSubtotal();
    if (appliedDiscount.type === 'percentage') {
      return subtotal * (appliedDiscount.value / 100);
    }
    return appliedDiscount.value;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    return Math.max(0, subtotal - discount);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomerData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateCheckout = () => {
    const { name, email, address, city, province, postalCode } = customerData;
    if (!name || !email || !address || !city || !province || !postalCode) {
      setError('Please fill in all required fields');
      return false;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    if (cart.length === 0) {
      setError('Your cart is empty');
      return false;
    }
    return true;
  };

  const submitOrder = async () => {
    if (!validateCheckout()) return;

    try {
      setSubmitting(true);
      setError(null);

      const orderData = {
        customer: customerData,
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          price: item.price,
          stripePriceId: item.stripePriceId
        })),
        subtotal: calculateSubtotal(),
        discount: calculateDiscount(),
        discountCode: appliedDiscount?.code || null,
        total: calculateTotal()
      };

      const response = await fetch(`${BACKEND_URL}/api/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) throw new Error('Failed to create invoice');

      const result = await response.json();
      setSuccessMessage(result.message || 'Order created successfully');
      setOrderSubmitted(true);
      setStep('confirmation');
      setCart([]);
      setAppliedDiscount(null);
      setCustomerData({
        name: '',
        email: '',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        country: 'Canada'
      });
    } catch (err) {
      setError(err.message || 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cart View
  if (step === 'cart') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Precision Hydration</h1>
                <p className="text-slate-600 text-sm mt-1">Tri Dimensions Reseller Portal</p>
              </div>
              <div className="flex items-center gap-2 bg-blue-100 px-4 py-2 rounded-lg">
                <ShoppingCart size={20} className="text-blue-600" />
                <span className="font-semibold text-blue-600">{cart.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Products */}
            <div className="lg:col-span-2">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Browse Products</h2>
                
                {loading ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader className="animate-spin text-blue-600" size={32} />
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-600">No products available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {products.map(product => (
                      <div
                        key={product.id}
                        className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-lg transition-all duration-300 group"
                      >
                        {/* Product Image */}
                        {product.image && (
                          <div className="relative h-64 bg-slate-100 overflow-hidden flex items-center justify-center">
                            <img
                              src={product.image}
                              alt={product.name}
                              className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}

                        {/* Product Info */}
                        <div className="p-4">
                          <h3 className="font-semibold text-slate-900 text-lg mb-2">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-slate-600 text-sm mb-4 line-clamp-2">
                              {product.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-4">
                            <span className="text-2xl font-bold text-blue-600">
                              ${(product.price / 100).toFixed(2)}
                            </span>
                            <button
                              onClick={() => addToCart(product)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
                            >
                              <Plus size={18} />
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-slate-200 p-6 sticky top-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <ShoppingCart size={22} />
                  Order Summary
                </h2>

                {cart.length === 0 ? (
                  <p className="text-slate-600 text-center py-8">Your cart is empty</p>
                ) : (
                  <>
                    <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                      {cart.map(item => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between border-b border-slate-200 pb-4"
                        >
                          <div className="flex-1">
                            <h4 className="font-medium text-slate-900 text-sm">{item.name}</h4>
                            <p className="text-blue-600 font-semibold text-sm mt-1">
                              ${(item.price / 100).toFixed(2)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="p-1 hover:bg-slate-100 rounded"
                            >
                              <Minus size={16} className="text-slate-600" />
                            </button>
                            <span className="w-8 text-center font-medium text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="p-1 hover:bg-slate-100 rounded"
                            >
                              <Plus size={16} className="text-slate-600" />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="ml-2 p-1 hover:bg-red-50 rounded text-red-600"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Discount Section */}
                    <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      {appliedDiscount ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {appliedDiscount.code}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              {appliedDiscount.type === 'percentage'
                                ? `${appliedDiscount.value}% off`
                                : `$${(appliedDiscount.value / 100).toFixed(2)} off`}
                            </p>
                          </div>
                          <button
                            onClick={removeDiscount}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="text"
                            placeholder="Discount code"
                            value={discountCode}
                            onChange={(e) => {
                              setDiscountCode(e.target.value);
                              setDiscountError(null);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={applyDiscount}
                            className="w-full bg-slate-600 hover:bg-slate-700 text-white text-sm py-2 rounded-lg font-medium transition-colors"
                          >
                            Apply Code
                          </button>
                          {discountError && (
                            <p className="text-red-600 text-xs mt-2">{discountError}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <div className="flex justify-between text-slate-700">
                        <span>Subtotal</span>
                        <span>${(calculateSubtotal() / 100).toFixed(2)}</span>
                      </div>
                      {appliedDiscount && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount</span>
                          <span>-${(calculateDiscount() / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <span>Total</span>
                        <span>${(calculateTotal() / 100).toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setStep('checkout')}
                      className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors duration-200"
                    >
                      Proceed to Checkout
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Checkout View
  if (step === 'checkout') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <button
              onClick={() => setStep('cart')}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm mb-4"
            >
              ← Back to Cart
            </button>
            <h1 className="text-2xl font-bold text-slate-900">Checkout</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Checkout Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg border border-slate-200 p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Billing & Shipping Information</h2>

                <div className="space-y-6">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={customerData.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={customerData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={customerData.address}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="123 Main Street"
                    />
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      City *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={customerData.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Toronto"
                    />
                  </div>

                  {/* Province / State */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Province/State *
                      </label>
                      <input
                        type="text"
                        name="province"
                        value={customerData.province}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ontario"
                      />
                    </div>

                    {/* Postal Code */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Postal Code *
                      </label>
                      <input
                        type="text"
                        name="postalCode"
                        value={customerData.postalCode}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="M5H 2N2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-slate-200 p-6 sticky top-6">
                <h2 className="text-lg font-bold text-slate-900 mb-6">Order Review</h2>

                <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                  {cart.map(item => (
                    <div
                      key={item.id}
                      className="flex justify-between text-sm border-b border-slate-200 pb-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-slate-600 text-xs">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-medium text-slate-900">
                        ${((item.price * item.quantity) / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>

                {appliedDiscount && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200 mb-6">
                    <p className="text-sm font-medium text-green-900">{appliedDiscount.code}</p>
                    <p className="text-xs text-green-700 mt-1">
                      {appliedDiscount.type === 'percentage'
                        ? `${appliedDiscount.value}% off`
                        : `$${(appliedDiscount.value / 100).toFixed(2)} off`}
                    </p>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex justify-between text-slate-700">
                    <span>Subtotal</span>
                    <span>${(calculateSubtotal() / 100).toFixed(2)}</span>
                  </div>
                  {appliedDiscount && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-${(calculateDiscount() / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total</span>
                    <span>${(calculateTotal() / 100).toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={submitOrder}
                  disabled={submitting}
                  className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Submit Order'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation View
  if (step === 'confirmation') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-slate-200 p-12 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 p-4 rounded-full">
              <CheckCircle className="text-green-600" size={32} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-4">Order Submitted!</h1>
          <p className="text-slate-600 mb-6">
            {successMessage || 'Your draft invoice has been created successfully.'}
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-700 mb-2">
              <span className="font-semibold">Payment Instructions:</span>
            </p>
            <p className="text-sm text-slate-600 mb-3">
              Please complete your payment by eTransfer to:
            </p>
            <p className="text-lg font-bold text-blue-600">stephane@tridimensions.ca</p>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            A confirmation email has been sent to <span className="font-semibold">{customerData.email}</span>
          </p>

          <button
            onClick={() => {
              setStep('cart');
              setOrderSubmitted(false);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors duration-200"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }
};

export default StripeCart;
