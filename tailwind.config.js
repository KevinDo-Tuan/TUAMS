module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        red: {
          50:  'hsl(12, 100%, 97%)',
          100: 'hsl(12, 92%, 90%)',
          200: 'hsl(12, 85%, 78%)',
          300: 'hsl(12, 80%, 65%)',
          400: 'hsl(12, 78%, 55%)',
          500: 'hsl(12, 72%, 48%)',
          600: 'hsl(12, 68%, 40%)',
          700: 'hsl(12, 64%, 32%)',
          800: 'hsl(12, 58%, 22%)',
          900: 'hsl(12, 52%, 15%)',
          950: 'hsl(12, 48%, 8%)',
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      animation: {
        in: "in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        out: "out 0.2s ease-in",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s linear infinite",
        "text-gradient-wave": "textGradientWave 2.5s infinite ease-in-out",
        "slide-up": "slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-in": "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "glow": "glowPulse 2.5s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        textGradientWave: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" }
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" }
        },
        in: {
          "0%": { transform: "translateY(8px) scale(0.98)", opacity: 0 },
          "100%": { transform: "translateY(0) scale(1)", opacity: 1 }
        },
        out: {
          "0%": { transform: "translateY(0) scale(1)", opacity: 1 },
          "100%": { transform: "translateY(8px) scale(0.98)", opacity: 0 }
        },
        pulse: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.5 }
        },
        slideUp: {
          "0%": { transform: "translateY(12px) scale(0.98)", opacity: 0 },
          "100%": { transform: "translateY(0) scale(1)", opacity: 1 }
        },
        slideDown: {
          "0%": { transform: "translateY(-8px) scale(0.98)", opacity: 0 },
          "100%": { transform: "translateY(0) scale(1)", opacity: 1 }
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 }
        },
        scaleIn: {
          "0%": { transform: "scale(0.92)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 }
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 8px hsla(12, 85%, 50%, 0.15)" },
          "50%": { boxShadow: "0 0 22px hsla(12, 85%, 50%, 0.4)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" }
        }
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      }
    }
  },
  plugins: []
}
