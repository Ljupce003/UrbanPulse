import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Landing() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
    color: 'white',
    paddingBottom: '3rem'
  }

  const heroStyle = {
    textAlign: 'center',
    padding: '4rem 2rem',
    maxWidth: '900px',
    margin: '0 auto'
  }

  const titleStyle = {
    fontSize: '3.5rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    background: 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  }

  const subtitleStyle = {
    fontSize: '1.3rem',
    color: '#aaa',
    marginBottom: '2rem',
    lineHeight: '1.6'
  }

  const ctaButtonStyle = {
    display: 'inline-block',
    padding: '1rem 2rem',
    backgroundColor: '#00d4ff',
    color: '#000',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    border: 'none',
    marginRight: '1rem',
    transition: 'all 0.3s'
  }

  const secondaryButtonStyle = {
    display: 'inline-block',
    padding: '1rem 2rem',
    backgroundColor: 'transparent',
    color: '#00d4ff',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    border: '2px solid #00d4ff',
    transition: 'all 0.3s'
  }

  const featuresStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '2rem',
    maxWidth: '1200px',
    margin: '3rem auto',
    padding: '0 2rem'
  }

  const featureCardStyle = {
    backgroundColor: 'rgba(0, 212, 255, 0.05)',
    border: '1px solid rgba(0, 212, 255, 0.2)',
    borderRadius: '8px',
    padding: '2rem',
    transition: 'all 0.3s'
  }

  const featureIconStyle = {
    fontSize: '2.5rem',
    marginBottom: '1rem'
  }

  const featureTitleStyle = {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: '#00d4ff'
  }

  const featureDescStyle = {
    color: '#aaa',
    lineHeight: '1.6',
    fontSize: '0.95rem'
  }

  const rolesStyle = {
    maxWidth: '1200px',
    margin: '3rem auto',
    padding: '2rem',
    backgroundColor: 'rgba(0, 212, 255, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(0, 212, 255, 0.2)'
  }

  const rolesTitleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#00d4ff',
    textAlign: 'center'
  }

  const rolesGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '2rem'
  }

  const roleCardStyle = {
    backgroundColor: 'rgba(10, 10, 10, 0.5)',
    padding: '1.5rem',
    borderRadius: '6px',
    border: '1px solid rgba(0, 212, 255, 0.15)'
  }

  const roleNameStyle = {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#00d4ff',
    marginBottom: '0.5rem'
  }

  const roleDescStyle = {
    color: '#aaa',
    fontSize: '0.9rem',
    lineHeight: '1.5'
  }

  const features = [
    {
      icon: '📊',
      title: 'Real-time Dashboard',
      description: 'Monitor current air quality, weather, and traffic conditions at a glance with color-coded indicators.'
    },
    {
      icon: '📈',
      title: 'Data Visualization',
      description: 'Explore time-series charts with customizable date ranges and compare predicted vs actual values.'
    },
    {
      icon: '🔍',
      title: 'Pollution Analysis',
      description: 'Understand the factors driving air quality changes with our pollution cause analyzer.'
    },
    {
      icon: '🎮',
      title: 'Scenario Simulator',
      description: 'Adjust parameters and see real-time impact on pollution and traffic predictions.'
    },
    {
      icon: '🤖',
      title: 'AI Predictions',
      description: 'Machine learning models provide accurate traffic and pollution forecasts with confidence metrics.'
    },
    {
      icon: '👥',
      title: 'Role-Based Access',
      description: 'Flexible permissions for general users, analysts, and administrators.'
    }
  ]

  const roles = [
    {
      name: 'General User',
      description: 'View-only access to the dashboard and historical data.'
    },
    {
      name: 'Analyst',
      description: 'Upload datasets, tune models, and perform advanced analysis.'
    },
    {
      name: 'Admin',
      description: 'Full access including user management and system configuration.'
    }
  ]

  return (
    <div style={containerStyle}>
      <div style={heroStyle}>
        <h1 style={titleStyle}>UrbanPulse</h1>
        <p style={subtitleStyle}>
          Analyze the relationship between traffic, weather, and air pollution.
          Understand urban dynamics. Make better decisions.
        </p>
        <div>
          {user ? (
            <button
              style={ctaButtonStyle}
              onClick={() => navigate('/dashboard')}
              onMouseOver={(e) => e.target.style.backgroundColor = '#00a8cc'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#00d4ff'}
            >
              Go to Dashboard
            </button>
          ) : (
            <>
              <button
                style={ctaButtonStyle}
                onClick={() => navigate('/login')}
                onMouseOver={(e) => e.target.style.backgroundColor = '#00a8cc'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#00d4ff'}
              >
                Get Started
              </button>
              <button
                style={secondaryButtonStyle}
                onClick={() => navigate('/login')}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#00d4ff'
                  e.target.style.color = '#000'
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'transparent'
                  e.target.style.color = '#00d4ff'
                }}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>

      <div style={featuresStyle}>
        {features.map((feature, idx) => (
          <div
            key={idx}
            style={featureCardStyle}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.4)'
              e.currentTarget.style.transform = 'translateY(-5px)'
              e.currentTarget.style.transition = 'all 0.3s'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.05)'
              e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.2)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={featureIconStyle}>{feature.icon}</div>
            <div style={featureTitleStyle}>{feature.title}</div>
            <div style={featureDescStyle}>{feature.description}</div>
          </div>
        ))}
      </div>

      <div style={rolesStyle}>
        <div style={rolesTitleStyle}>User Roles & Permissions</div>
        <div style={rolesGridStyle}>
          {roles.map((role, idx) => (
            <div key={idx} style={roleCardStyle}>
              <div style={roleNameStyle}>{role.name}</div>
              <div style={roleDescStyle}>{role.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '3rem', color: '#666' }}>
        <p>© 2026 UrbanPulse. Analyzing cities, one data point at a time.</p>
      </div>
    </div>
  )
}
