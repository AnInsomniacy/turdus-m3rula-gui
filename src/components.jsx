import React, {useEffect, useRef, useState} from 'react'

export const Modal = ({isOpen, onClose, title, children, footer, canClose = true, error = false}) => {
    const [isClosing, setIsClosing] = useState(false)
    const [shouldShow, setShouldShow] = useState(false)
    const prevOpenRef = useRef(false)

    useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            setShouldShow(false)
            setIsClosing(false)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setShouldShow(true)
                })
            })
        } else if (!isOpen && prevOpenRef.current) {
            setIsClosing(true)
            setTimeout(() => {
                setIsClosing(false)
                setShouldShow(false)
            }, 200)
        }
        prevOpenRef.current = isOpen
    }, [isOpen])

    const handleClose = () => {
        if (!canClose) return
        setIsClosing(true)
        setTimeout(() => {
            onClose()
            setIsClosing(false)
        }, 200)
    }

    if (!isOpen && !isClosing) return null

    const borderColor = error ? 'border-red-500/30' : 'border-cyan-500/30'
    const shadowColor = error ? 'shadow-red-500/20' : 'shadow-cyan-500/20'
    const headerBorder = error ? 'border-red-500/20' : 'border-cyan-500/20'
    const titleColor = error ? 'text-red-400' : 'text-cyan-400'

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${shouldShow && !isClosing ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-all duration-200" onClick={handleClose}/>
            <div className={`relative bg-slate-900 border ${borderColor} rounded-xl shadow-2xl ${shadowColor} w-full max-w-md mx-4 transition-all duration-200 ${shouldShow && !isClosing ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
                <div className={`px-6 py-4 border-b ${headerBorder}`}>
                    <h2 className={`text-lg font-bold ${titleColor}`}>{title}</h2>
                </div>
                <div className="px-6 py-6">{children}</div>
                {footer && <div className={`px-6 py-4 border-t ${headerBorder} flex justify-end gap-3`}>{footer}</div>}
            </div>
        </div>
    )
}

export const Button = ({children, onClick, variant = 'solid', color = 'cyan', size = 'md', disabled, className = ''}) => {
    const base = 'font-semibold rounded-lg transition-all duration-200 ease-in-out flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95'
    const sizes = {sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base'}
    const variants = {
        solid: {
            cyan: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50',
            red: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50',
            green: 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50',
            gray: 'bg-slate-700 hover:bg-slate-600 text-white'
        },
        outline: {
            cyan: 'border-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400',
            red: 'border-2 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-400'
        },
        ghost: 'text-slate-400 hover:bg-slate-800'
    }
    const variantClass = variant === 'ghost' ? variants.ghost : variants[variant][color]
    return <button onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variantClass} ${className}`}>{children}</button>
}

export const Input = ({value, onChange, placeholder, readOnly, className = ''}) => {
    return (
        <input
            type="text"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`w-full px-3 py-2 bg-slate-800 border border-cyan-500/30 rounded-lg text-sm text-slate-100 placeholder-slate-500 placeholder:opacity-100 focus:placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all duration-200 ease-in-out ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:border-cyan-500/50'} ${className}`}
        />
    )
}

export const CustomSelect = ({value, onChange, options, className = ''}) => {
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedOption = options.find(opt => opt.value === value)

    return (
        <div ref={ref} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 bg-slate-800 border border-cyan-500/30 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all duration-200 ease-in-out hover:border-cyan-500/50 cursor-pointer flex items-center justify-between"
            >
                <span>{selectedOption?.label || 'Select...'}</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div className={`absolute z-50 w-full mt-1 bg-slate-800 border border-cyan-500/30 rounded-lg shadow-2xl shadow-black/50 overflow-hidden transition-all duration-200 ease-in-out origin-top ${
                isOpen ? 'opacity-100 scale-y-100 translate-y-0' : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'
            }`}>
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                            onChange(opt.value)
                            setIsOpen(false)
                        }}
                        className={`w-full px-3 py-2 text-sm text-left transition-all duration-150 ease-in-out ${
                            opt.value === value
                                ? 'bg-cyan-600 text-white'
                                : 'text-slate-100 hover:bg-slate-700'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

export const Badge = ({children, color = 'gray', className = ''}) => {
    const colors = {
        cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
        green: 'bg-green-500/20 text-green-300 border-green-400/40',
        red: 'bg-red-500/20 text-red-300 border-red-400/40',
        yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
        gray: 'bg-slate-500/20 text-slate-400 border-slate-500/40'
    }
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border transition-all duration-200 ${colors[color]} ${className}`}>{children}</span>
}

export const Spinner = () => {
    return (
        <div className="relative w-4 h-4">
            <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    )
}

export const Toast = ({message, type = 'info', show, onClose}) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(onClose, 3000)
            return () => clearTimeout(timer)
        }
    }, [show, onClose])

    const colors = {
        success: 'bg-green-600 border-green-500',
        error: 'bg-red-600 border-red-500',
        warning: 'bg-yellow-600 border-yellow-500',
        info: 'bg-cyan-600 border-cyan-500'
    }

    return (
        <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out ${show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
            <div className={`${colors[type]} text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 min-w-[200px] border`}>
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                <span className="text-sm font-medium">{message}</span>
            </div>
        </div>
    )
}
